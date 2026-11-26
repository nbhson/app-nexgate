import { Hono, type Context, type MiddlewareHandler } from "hono";
import { requireAdmin } from "./auth.js";
import {
  listProviders, getProvider, createProvider,
  updateProvider, deleteProvider, getProviderDecrypted,
} from "../../services/providers.js";
import { testUpstream } from "../../providers/openai-compatible.js";
import { encryptSecret } from "../../security/crypto.js";
import { recordAudit } from "../../services/audit.js";

type AdminVars = { Variables: { adminUser: string } };

const adminGuard: MiddlewareHandler<AdminVars> = async (c, next) => {
  if (!requireAdmin(c)) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } }, 401) as Response;
  }
  return next();
};

function audit(c: Context, action: string, target?: string) {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  recordAudit(c.get("adminUser") as string | undefined, action, target, ip);
}

export const adminProviders = new Hono<AdminVars>();
adminProviders.use("*", adminGuard);

/** Mask key thật: "[encrypted]" nếu có key, "" nếu provider không dùng key. */
function maskKey<T extends { apiKeyEnc: string }>(p: T): T {
  return { ...p, apiKeyEnc: p.apiKeyEnc ? "[encrypted]" : "" };
}

adminProviders.get("/", (c) => {
  const all = listProviders().map(maskKey);
  return c.json({ data: all });
});

adminProviders.get("/:id", (c) => {
  const p = getProvider(c.req.param("id"));
  if (!p) return c.json({ error: { code: "NOT_FOUND", message: "Provider không tìm thấy" } }, 404);
  return c.json({ data: maskKey(p) });
});

adminProviders.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    baseUrl: string;
    apiKey?: string;
    enabled?: boolean;
  }>();
  if (!body.name || !body.baseUrl) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "name, baseUrl bắt buộc" } }, 400);
  }
  const key = (body.apiKey ?? "").trim();
  const p = createProvider({
    name: body.name,
    baseUrl: body.baseUrl.replace(/\/+$/, ""),
    apiKeyEnc: key ? encryptSecret(key) : "",
    enabled: body.enabled ?? true,
  });
  audit(c, "provider.create", p.name);
  return c.json({ data: maskKey(p) }, 201);
});

adminProviders.patch("/:id", async (c) => {
  const body = await c.req.json<{ name?: string; baseUrl?: string; apiKey?: string | null; enabled?: boolean }>();
  const upd: Record<string, unknown> = {};
  if (body.name) upd.name = body.name;
  if (body.baseUrl) upd.baseUrl = body.baseUrl.replace(/\/+$/, "");
  if (body.apiKey === null) upd.apiKeyEnc = ""; // xoá key — provider không dùng key
  else if (body.apiKey) upd.apiKeyEnc = encryptSecret(body.apiKey);
  if (body.enabled != null) upd.enabled = body.enabled;
  const updated = updateProvider(c.req.param("id"), upd);
  if (!updated) return c.json({ error: { code: "NOT_FOUND", message: "Provider không tìm thấy" } }, 404);
  audit(c, "provider.update", updated.name);
  return c.json({ data: maskKey(updated) });
});

adminProviders.delete("/:id", (c) => {
  const p = getProvider(c.req.param("id"));
  const ok = deleteProvider(c.req.param("id"));
  if (!ok) return c.json({ error: { code: "NOT_FOUND", message: "Provider không tìm thấy" } }, 404);
  audit(c, "provider.delete", p?.name ?? c.req.param("id"));
  return c.json({ ok: true });
});

adminProviders.post("/:id/test", async (c) => {
  const p = getProviderDecrypted(c.req.param("id"));
  if (!p) return c.json({ error: { code: "NOT_FOUND", message: "Provider không tìm thấy" } }, 404);
  const result = await testUpstream(p.baseUrl, p.apiKey);
  return c.json(result);
});

export type { AdminVars };
export { requireAdmin };
