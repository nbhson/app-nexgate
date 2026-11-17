import { Hono, type Context, type MiddlewareHandler } from "hono";
import { requireAdmin } from "./auth.js";
import {
  listProviders, getProvider, createProvider,
  updateProvider, deleteProvider, getProviderDecrypted,
} from "../../services/providers.js";
import { testUpstream } from "../../providers/openai-compatible.js";
import { encryptSecret } from "../../security/crypto.js";

type AdminVars = { Variables: { adminUser: string } };

const adminGuard: MiddlewareHandler<AdminVars> = async (c, next) => {
  if (!requireAdmin(c)) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } }, 401) as Response;
  }
  return next();
};

export const adminProviders = new Hono<AdminVars>();
adminProviders.use("*", adminGuard);

adminProviders.get("/", (c) => {
  const all = listProviders().map((p) => ({ ...p, apiKeyEnc: "[encrypted]" }));
  return c.json({ data: all });
});

adminProviders.get("/:id", (c) => {
  const p = getProvider(c.req.param("id"));
  if (!p) return c.json({ error: { code: "NOT_FOUND", message: "Provider không tìm thấy" } }, 404);
  return c.json({ data: { ...p, apiKeyEnc: "[encrypted]" } });
});

adminProviders.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    baseUrl: string;
    apiKey: string;
    enabled?: boolean;
  }>();
  if (!body.name || !body.baseUrl || !body.apiKey) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "name, baseUrl, apiKey bắt buộc" } }, 400);
  }
  const p = createProvider({
    name: body.name,
    baseUrl: body.baseUrl.replace(/\/+$/, ""),
    apiKeyEnc: encryptSecret(body.apiKey),
    enabled: body.enabled ?? true,
  });
  return c.json({ data: p }, 201);
});

adminProviders.patch("/:id", async (c) => {
  const body = await c.req.json<{ name?: string; baseUrl?: string; apiKey?: string; enabled?: boolean }>();
  const upd: Record<string, unknown> = {};
  if (body.name) upd.name = body.name;
  if (body.baseUrl) upd.baseUrl = body.baseUrl.replace(/\/+$/, "");
  if (body.apiKey) upd.apiKeyEnc = encryptSecret(body.apiKey);
  if (body.enabled != null) upd.enabled = body.enabled;
  const updated = updateProvider(c.req.param("id"), upd);
  if (!updated) return c.json({ error: { code: "NOT_FOUND", message: "Provider không tìm thấy" } }, 404);
  return c.json({ data: { ...updated, apiKeyEnc: "[encrypted]" } });
});

adminProviders.delete("/:id", (c) => {
  const ok = deleteProvider(c.req.param("id"));
  if (!ok) return c.json({ error: { code: "NOT_FOUND", message: "Provider không tìm thấy" } }, 404);
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
