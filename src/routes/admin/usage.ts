import { Hono, type MiddlewareHandler } from "hono";
import { requireAdmin, type AdminVars } from "./providers.js";
import {
  getUsageSummary,
  getTimeSeries,
  getRecentLogs,
  getTodayStats,
  getUsageByModel,
  countLogs,
} from "../../services/usage.js";

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

/** Usage gộp theo model (kèm chi phí ước tính nếu model có giá token). */
adminUsage.get("/models", (c) => {
  const now = Date.now();
  const from = c.req.query("from") ? parseInt(c.req.query("from")!, 10) : now - 30 * 24 * 3600_000;
  const to = c.req.query("to") ? parseInt(c.req.query("to")!, 10) : now;
  const keyId = c.req.query("keyId") || undefined;
  return c.json({ data: getUsageByModel(from, to, keyId) });
});

adminUsage.get("/timeseries", (c) => {
  const now = Date.now();
  const from = c.req.query("from") ? parseInt(c.req.query("from")!, 10) : now - 14 * 24 * 3600_000;
  const to = c.req.query("to") ? parseInt(c.req.query("to")!, 10) : now;
  const granularity = (c.req.query("granularity") ?? "day") as "hour" | "day";
  const keyId = c.req.query("keyId") || undefined;
  const modelId = c.req.query("modelId") || undefined;
  return c.json({ data: getTimeSeries(from, to, granularity, { keyId, modelId }) });
});

adminUsage.get("/logs", (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10), 200);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);
  const status = c.req.query("status");
  let statusCode: number | undefined;
  let statusClass: number | undefined;
  if (status) {
    const m = /^([1-5])xx$/i.exec(status);
    if (m?.[1]) statusClass = parseInt(m[1], 10);
    else if (status && /^\d{3}$/.test(status)) statusCode = parseInt(status, 10);
  }
  const filters = {
    apiKeyId: c.req.query("keyId") || undefined,
    modelId: c.req.query("modelId") || undefined,
    statusCode,
    statusClass,
  };
  return c.json({ data: getRecentLogs(limit, offset, filters), total: countLogs(filters) });
});
