import { Hono, type MiddlewareHandler } from "hono";
import { requireAdmin, type AdminVars } from "./providers.js";
import {
  listClientKeys, getClientKey, createClientKey,
  deleteClientKey, updateClientKey, rotateClientKey,
} from "../../services/keys.js";

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

adminKeys.get("/", (c) => c.json({ data: listClientKeys().map(sanitize) }));

adminKeys.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    modelWhitelist?: string[];
    quotaTokens?: number;
    rateLimitPerMin?: number;
    expiresAt?: number;
  }>();
  if (!body.name) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "name bắt buộc" } }, 400);
  }
  const { key, record } = createClientKey({
    name: body.name,
    modelWhitelist: body.modelWhitelist,
    quotaTokens: body.quotaTokens,
    rateLimitPerMin: body.rateLimitPerMin,
    expiresAt: body.expiresAt,
  });
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
    quotaTokens?: number;
    rateLimitPerMin?: number;
    enabled?: boolean;
    expiresAt?: number | null;
  }>();
  const updated = updateClientKey(c.req.param("id"), {
    ...body,
    modelWhitelist: body.modelWhitelist ? JSON.stringify(body.modelWhitelist) : undefined,
  });
  if (!updated) return c.json({ error: { code: "NOT_FOUND", message: "Key không tìm thấy" } }, 404);
  return c.json({ data: sanitize(updated) });
});

adminKeys.delete("/:id", (c) => {
  const ok = deleteClientKey(c.req.param("id"));
  if (!ok) return c.json({ error: { code: "NOT_FOUND", message: "Key không tìm thấy" } }, 404);
  return c.json({ ok: true });
});

adminKeys.post("/:id/rotate", (c) => {
  const result = rotateClientKey(c.req.param("id"));
  if (!result) return c.json({ error: { code: "NOT_FOUND", message: "Key không tìm thấy" } }, 404);
  return c.json({ data: { newKey: result.newKey } });
});

adminKeys.get("/:id/usage", (c) => {
  return c.json({ data: { message: "Dùng /admin/usage?keyId=... để lấy" } });
});
