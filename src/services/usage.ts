import { eq, and, desc, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { usageLogs } from "../db/schema.js";
import type { NewUsageLog, UsageLog } from "../db/schema.js";

export interface UsageStats {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function logUsage(data: Omit<NewUsageLog, "id" | "createdAt">): void {
  db.insert(usageLogs).values({ ...data, id: 0, createdAt: Date.now() }).run();
}

export function getUsageSummary(keyId?: string, fromMs?: number, toMs?: number): UsageStats[] {
  const cond: SQL[] = [];
  if (keyId) cond.push(eq(usageLogs.apiKeyId, keyId));
  if (fromMs) cond.push(sql`${usageLogs.createdAt} >= ${fromMs}`);
  if (toMs) cond.push(sql`${usageLogs.createdAt} <= ${toMs}`);

  const rows = db
    .select({
      keyId: usageLogs.apiKeyId,
      requests: sql<number>`count(*)`.as("requests"),
      inputTokens: sql<number>`sum(${usageLogs.inputTokens})`.as("input"),
      outputTokens: sql<number>`sum(${usageLogs.outputTokens})`.as("output"),
      totalTokens: sql<number>`sum(${usageLogs.totalTokens})`.as("total"),
    })
    .from(usageLogs)
    .where(cond.length > 0 ? and(...cond) : undefined)
    .groupBy(usageLogs.apiKeyId)
    .all();

  return rows.map((r) => ({
    requests: r.requests ?? 0,
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    totalTokens: r.totalTokens ?? 0,
  }));
}

export interface TimeSeriesPoint {
  ts: string;
  requests: number;
  totalTokens: number;
}

export function getTimeSeries(fromMs: number, toMs: number, granularity: "hour" | "day" = "day"): TimeSeriesPoint[] {
  const expr = granularity === "hour"
    ? sql`strftime('%Y-%m-%d %H:00', datetime(${usageLogs.createdAt} / 1000, 'unixepoch'))`
    : sql`strftime('%Y-%m-%d', datetime(${usageLogs.createdAt} / 1000, 'unixepoch'))`;

  const rows = db
    .select({
      ts: expr.as("ts"),
      requests: sql<number>`count(*)`.as("requests"),
      totalTokens: sql<number>`sum(${usageLogs.totalTokens})`.as("total"),
    })
    .from(usageLogs)
    .where(and(sql`${usageLogs.createdAt} >= ${fromMs}`, sql`${usageLogs.createdAt} <= ${toMs}`))
    .groupBy(expr)
    .orderBy(expr)
    .all();

  return rows.map((r) => ({
    ts: String(r.ts),
    requests: r.requests ?? 0,
    totalTokens: r.totalTokens ?? 0,
  }));
}

export function getRecentLogs(
  limit = 50,
  offset = 0,
  filters?: { apiKeyId?: string; modelId?: string; statusCode?: number }
): UsageLog[] {
  const cond: SQL[] = [];
  if (filters?.apiKeyId) cond.push(eq(usageLogs.apiKeyId, filters.apiKeyId));
  if (filters?.modelId) cond.push(eq(usageLogs.modelId, filters.modelId));
  if (filters?.statusCode != null) cond.push(eq(usageLogs.statusCode, filters.statusCode));

  return db
    .select()
    .from(usageLogs)
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(usageLogs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
}

export function getTodayStats(): UsageStats {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const fromMs = dayStart.getTime();

  const row = db
    .select({
      requests: sql<number>`count(*)`.as("requests"),
      inputTokens: sql<number>`coalesce(sum(${usageLogs.inputTokens}),0)`.as("input"),
      outputTokens: sql<number>`coalesce(sum(${usageLogs.outputTokens}),0)`.as("output"),
      totalTokens: sql<number>`coalesce(sum(${usageLogs.totalTokens}),0)`.as("total"),
    })
    .from(usageLogs)
    .where(sql`${usageLogs.createdAt} >= ${fromMs}`)
    .get();

  return {
    requests: row?.requests ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    totalTokens: row?.totalTokens ?? 0,
  };
}
