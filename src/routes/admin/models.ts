import { Hono, type MiddlewareHandler } from "hono";
import { requireAdmin, type AdminVars } from "./providers.js";
import { listModels, createModel, updateModel, deleteModel } from "../../services/models.js";
import { getProvider } from "../../services/providers.js";

const adminGuard: MiddlewareHandler<AdminVars> = async (c, next) => {
  if (!requireAdmin(c)) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } }, 401) as Response;
  }
  return next();
};

export const adminModels = new Hono<AdminVars>();
adminModels.use("*", adminGuard);

adminModels.get("/", (c) => c.json({ data: listModels() }));

adminModels.post("/", async (c) => {
  const body = await c.req.json<{
    exposedId: string;
    providerId: string;
    upstreamModelId?: string;
    enabled?: boolean;
    maxTokens?: number;
  }>();
  if (!body.exposedId || !body.providerId) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "exposedId, providerId bắt buộc" } }, 400);
  }
  if (!getProvider(body.providerId)) {
    return c.json({ error: { code: "NOT_FOUND", message: "Provider không tồn tại" } }, 404);
  }
  const model = createModel({
    exposedId: body.exposedId,
    providerId: body.providerId,
    upstreamModelId: body.upstreamModelId ?? body.exposedId,
    enabled: body.enabled ?? true,
    maxTokens: body.maxTokens,
  });
  return c.json({ data: model }, 201);
});

adminModels.patch("/:exposedId", async (c) => {
  const body = await c.req.json<{ providerId?: string; upstreamModelId?: string; enabled?: boolean; maxTokens?: number }>();
  const updated = updateModel(c.req.param("exposedId"), body);
  if (!updated) return c.json({ error: { code: "NOT_FOUND", message: "Model không tìm thấy" } }, 404);
  return c.json({ data: updated });
});

adminModels.delete("/:exposedId", (c) => {
  const ok = deleteModel(c.req.param("exposedId"));
  if (!ok) return c.json({ error: { code: "NOT_FOUND", message: "Model không tìm thấy" } }, 404);
  return c.json({ ok: true });
});
