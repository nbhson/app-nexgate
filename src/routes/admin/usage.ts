import { Hono, type MiddlewareHandler } from "hono";
import { requireAdmin, type AdminVars } from "./providers.js";
import { getUsageSummary, getTimeSeries, getRecentLogs, getTodayStats } from "../../services/usage.js";

const adminGuard: MiddlewareHandler<AdminVars> = async (c, next) => {
  if (!requireAdmin(c)) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Chưa đăng nhập" } }, 401) as Response;
  }
  return next();
};

export const adminUsage = new Hono<AdminVars>();
adminUsage.use("*", adminGuard);

adminUsage.get("/today", (c) => c.json({ data: getTodayStats() }));

adminUsage.get("/summary", (c) => {
  const now = Date.now();
  const from = c.req.query("from") ? parseInt(c.req.query("from")!, 10) : now - 30 * 24 * 3600_000;
  const to = c.req.query("to") ? parseInt(c.req.query("to")!, 10) : now;
  const keyId = c.req.query("keyId") || undefined;
  return c.json({ data: getUsageSummary(keyId, from, to) });
});

adminUsage.get("/timeseries", (c) => {
  const now = Date.now();
  const from = c.req.query("from") ? parseInt(c.req.query("from")!, 10) : now - 14 * 24 * 3600_000;
  const to = c.req.query("to") ? parseInt(c.req.query("to")!, 10) : now;
  const granularity = (c.req.query("granularity") ?? "day") as "hour" | "day";
  return c.json({ data: getTimeSeries(from, to, granularity) });
});

adminUsage.get("/logs", (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const logs = getRecentLogs(limit, offset, {
    apiKeyId: c.req.query("keyId") || undefined,
    modelId: c.req.query("modelId") || undefined,
    statusCode: c.req.query("status") ? parseInt(c.req.query("status")!, 10) : undefined,
  });
  return c.json({ data: logs });
});
