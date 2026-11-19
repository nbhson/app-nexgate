import { Hono, type Context, type MiddlewareHandler } from "hono";
import { requireAdmin, type AdminVars } from "./providers.js";
import { getAllSettings, updateSettings, type SettingsUpdate } from "../../services/settings.js";
import { recordAudit } from "../../services/audit.js";

const adminGuard: MiddlewareHandler<AdminVars> = async (c, next) => {
  if (!requireAdmin(c)) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } }, 401) as Response;
  }
  return next();
};

export const adminSettings = new Hono<AdminVars>();
adminSettings.use("*", adminGuard);

/** Danh sách setting: key, label, hint, giá trị hiệu dụng, có override chưa. */
adminSettings.get("/", (c) => c.json({ data: getAllSettings() }));

adminSettings.put("/", async (c) => {
  const body = await c.req.json<SettingsUpdate>();
  const { ok, errors } = updateSettings(body);
  const ctx = c as unknown as Context;
  if (ok.length > 0) {
    recordAudit(ctx.get("adminUser") as string | undefined, "settings.update", ok.join(","));
  }
  if (errors.length > 0 && ok.length === 0) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: errors.join("; ") } }, 400);
  }
  return c.json({ data: getAllSettings(), errors });
});
