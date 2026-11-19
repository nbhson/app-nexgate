import { Hono, type Context, type MiddlewareHandler } from "hono";
import { requireAdmin, type AdminVars } from "./providers.js";
import { listModels, createModel, updateModel, deleteModel } from "../../services/models.js";
import { getProvider } from "../../services/providers.js";
import { recordAudit } from "../../services/audit.js";

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
    costInputPer1k?: number;
    costOutputPer1k?: number;
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
    costInputPer1k: body.costInputPer1k ?? null,
    costOutputPer1k: body.costOutputPer1k ?? null,
  });
  audit(c, "model.create", model.exposedId);
  return c.json({ data: model }, 201);
});

adminModels.patch("/:exposedId", async (c) => {
  const body = await c.req.json<{
    providerId?: string;
    upstreamModelId?: string;
    enabled?: boolean;
    maxTokens?: number | null;
    costInputPer1k?: number | null;
    costOutputPer1k?: number | null;
  }>();
  const updated = updateModel(c.req.param("exposedId"), body);
  if (!updated) return c.json({ error: { code: "NOT_FOUND", message: "Model không tìm thấy" } }, 404);
  audit(c, "model.update", updated.exposedId);
  return c.json({ data: updated });
});

adminModels.delete("/:exposedId", (c) => {
  const ok = deleteModel(c.req.param("exposedId"));
  if (!ok) return c.json({ error: { code: "NOT_FOUND", message: "Model không tìm thấy" } }, 404);
  audit(c, "model.delete", c.req.param("exposedId"));
  return c.json({ ok: true });
});
