import { Hono, type MiddlewareHandler } from "hono";
import { requireAdmin, type AdminVars } from "./providers.js";
import { listAuditLogs } from "../../services/audit.js";

const adminGuard: MiddlewareHandler<AdminVars> = async (c, next) => {
  if (!requireAdmin(c)) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } }, 401) as Response;
  }
  return next();
};

export const adminAudit = new Hono<AdminVars>();
adminAudit.use("*", adminGuard);

adminAudit.get("/", (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10), 500);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  return c.json({ data: listAuditLogs(limit, offset) });
});
