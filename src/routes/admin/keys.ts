import { Hono, type Context, type MiddlewareHandler } from "hono";
import { requireAdmin, type AdminVars } from "./providers.js";
import {
  listClientKeys, getClientKey, createClientKey,
  deleteClientKey, updateClientKey, rotateClientKey,
  getMonthlyUsage, getLastUsedAt, parseWhitelist,
} from "../../services/keys.js";
import { getUsageByModel } from "../../services/usage.js";
import { recordAudit } from "../../services/audit.js";

const adminGuard: MiddlewareHandler<AdminVars> = async (c, next) => {
  if (!requireAdmin(c)) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } }, 401) as Response;
  }
  return next();
};

export const adminKeys = new Hono<AdminVars>();
adminKeys.use("*", adminGuard);

function sanitize<T extends object>(rec: T): Omit<T, "keyHash"> {
  const { keyHash: _kh, ...rest } = rec as T & { keyHash?: string };
  return rest as Omit<T, "keyHash">;
}

function audit(c: Context, action: string, target?: string) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  recordAudit(c.get("adminUser") as string | undefined, action, target, ip);
}

/** Whitelist JSON → array để UI render dễ (kèm metadata usage). */
function withDetails(rec: ReturnType<typeof getClientKey>) {
  if (!rec) return null;
  const base = sanitize(rec);
  return {
    ...base,
    modelWhitelist: JSON.stringify(parseWhitelist(rec.modelWhitelist)),
    providerWhitelist: JSON.stringify(parseWhitelist(rec.providerWhitelist)),
    quotaUsed: getMonthlyUsage(rec.id, rec.quotaResetDay),
    lastUsedAt: getLastUsedAt(rec.id),
  };
}

adminKeys.get("/", (c) => {
  return c.json({ data: listClientKeys().map((k) => withDetails(k)) });
});

function parseStringArray(v: unknown): string[] | null {
  if (v == null) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    return null;
  }
  return v as string[];
}

adminKeys.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    modelWhitelist?: string[];
    providerWhitelist?: string[];
    quotaTokens?: number;
    rateLimitPerMin?: number;
    expiresAt?: number;
  }>();
  if (!body.name) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "name bắt buộc" } }, 400);
  }

  const models = parseStringArray(body.modelWhitelist);
  const providers = parseStringArray(body.providerWhitelist);
  if (models == null || providers == null) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "whitelist phải là mảng string" } }, 400);
  }

  const { key, record } = createClientKey({
    name: body.name,
    modelWhitelist: models,
    providerWhitelist: providers,
    quotaTokens: body.quotaTokens,
    rateLimitPerMin: body.rateLimitPerMin,
    expiresAt: body.expiresAt,
  });
  audit(c, "key.create", record.name);
  return c.json({ data: { ...sanitize(record), key } }, 201);
});

adminKeys.get("/:id", (c) => {
  const k = getClientKey(c.req.param("id"));
  if (!k) return c.json({ error: { code: "NOT_FOUND", message: "Key không tìm thấy" } }, 404);
  return c.json({ data: sanitize(k) });
});

adminKeys.patch("/:id", async (c) => {
  const body = await c.req.json<{
    name?: string;
    modelWhitelist?: string[];
    providerWhitelist?: string[];
    quotaTokens?: number | null;
    rateLimitPerMin?: number | null;
    enabled?: boolean;
    expiresAt?: number | null;
  }>();

  // FIX: trước đây không cho xoá whitelist về rỗng (mất key → giữ giá trị cũ)
  // và không cho set lại quota/rateLimit về null.
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if ("enabled" in body && typeof body.enabled === "boolean") patch.enabled = body.enabled;

  if ("modelWhitelist" in body) {
    const wl = parseStringArray(body.modelWhitelist);
    if (wl == null) return c.json({ error: { code: "VALIDATION_ERROR", message: "modelWhitelist phải là mảng string" } }, 400);
    patch.modelWhitelist = JSON.stringify(wl);
  }
  if ("providerWhitelist" in body) {
    const wl = parseStringArray(body.providerWhitelist);
    if (wl == null) return c.json({ error: { code: "VALIDATION_ERROR", message: "providerWhitelist phải là mảng string" } }, 400);
    patch.providerWhitelist = JSON.stringify(wl);
  }
  if ("quotaTokens" in body) {
    patch.quotaTokens = body.quotaTokens == null || body.quotaTokens <= 0 ? null : Math.trunc(body.quotaTokens);
  }
  if ("rateLimitPerMin" in body) {
    patch.rateLimitPerMin = body.rateLimitPerMin == null || body.rateLimitPerMin <= 0 ? null : Math.trunc(body.rateLimitPerMin);
  }
  if ("expiresAt" in body) patch.expiresAt = body.expiresAt ?? null;

  const updated = updateClientKey(c.req.param("id"), patch as never);
  if (!updated) return c.json({ error: { code: "NOT_FOUND", message: "Key không tìm thấy" } }, 404);
  audit(c, "key.update", updated.name);
  return c.json({ data: sanitize(updated) });
});

adminKeys.delete("/:id", (c) => {
  const k = getClientKey(c.req.param("id"));
  const ok = deleteClientKey(c.req.param("id"));
  if (!ok) return c.json({ error: { code: "NOT_FOUND", message: "Key không tìm thấy" } }, 404);
  audit(c, "key.delete", k?.name);
  return c.json({ ok: true });
});

adminKeys.post("/:id/rotate", (c) => {
  const result = rotateClientKey(c.req.param("id"));
  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Key không tìm thấy" } }, 404);
  const k = getClientKey(c.req.param("id"));
  audit(c, "key.rotate", k?.name);
  return c.json({ data: { newKey: result.newKey } });
});

/** Tổng hợp usage của 1 key: tháng này + breakdown theo model (30 ngày). */
adminKeys.get("/:id/usage", (c) => {
  const id = c.req.param("id");
  const k = getClientKey(id);
  if (!k) return c.json({ error: { code: "NOT_FOUND", message: "Key không tìm thấy" } }, 404);
  const now = Date.now();
  return c.json({
    data: {
      quotaUsed: getMonthlyUsage(id, k.quotaResetDay),
      quotaTokens: k.quotaTokens,
      lastUsedAt: getLastUsedAt(id),
      byModel: getUsageByModel(now - 30 * 24 * 3600_000, now, id),
    },
  });
});
