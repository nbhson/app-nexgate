import { eq, and, desc, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import { usageLogs, models } from "../db/schema.js";
import type { NewUsageLog, UsageLog } from "../db/schema.js";

export interface UsageStats {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function logUsage(data: Omit<NewUsageLog, "id" | "createdAt">): void {
  // FIX bug nghiêm trọng: từng truyền id: 0 hard-code → row thứ 2 trở đi
  // va chạm UNIQUE constraint, request trả 500 và usage KHÔNG được ghi
  // ("dùng 2 model nhưng chỉ display 1"). autoIncrement tự sinh id.
  db.insert(usageLogs).values({ ...data, createdAt: Date.now() }).run();
}

export function getUsageSummary(keyId?: string, fromMs?: number, toMs?: number): Array<UsageStats & { keyId: string }> {
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
    keyId: r.keyId,
    requests: r.requests ?? 0,
    inputTokens: r.inputTokens ?? 0,
    outputTokens: r.outputTokens ?? 0,
    totalTokens: r.totalTokens ?? 0,
  }));
}

export interface ModelUsageStats extends UsageStats {
  modelId: string;
  providerId: string;
  /** USD ước tính từ giá token khai báo ở model (null nếu chưa khai báo giá). */
  costUsd: number | null;
}

/** Usage gộp theo model — trả lời câu hỏi "đã dùng những model nào, bao nhiêu". */
export function getUsageByModel(fromMs: number, toMs: number, keyId?: string): ModelUsageStats[] {
  const cond: SQL[] = [sql`${usageLogs.createdAt} >= ${fromMs}`, sql`${usageLogs.createdAt} <= ${toMs}`];
  if (keyId) cond.push(eq(usageLogs.apiKeyId, keyId));

  const rows = db
    .select({
      modelId: usageLogs.modelId,
      providerId: usageLogs.providerId,
      requests: sql<number>`count(*)`.as("requests"),
      inputTokens: sql<number>`sum(${usageLogs.inputTokens})`.as("input"),
      outputTokens: sql<number>`sum(${usageLogs.outputTokens})`.as("output"),
      totalTokens: sql<number>`sum(${usageLogs.totalTokens})`.as("total"),
    })
    .from(usageLogs)
    .where(and(...cond))
    .groupBy(usageLogs.modelId, usageLogs.providerId)
    .orderBy(sql`sum(${usageLogs.totalTokens}) desc`)
    .all();

  const priceMap = new Map(
    db
      .select({
        exposedId: models.exposedId,
        costIn: models.costInputPer1k,
        costOut: models.costOutputPer1k,
      })
      .from(models)
      .all()
      .map((m) => [m.exposedId, { in: m.costIn, out: m.costOut }])
  );

  return rows.map((r) => {
    const price = priceMap.get(r.modelId);
    let costUsd: number | null = null;
    if (price && (price.in != null || price.out != null)) {
      costUsd = ((r.inputTokens ?? 0) / 1000) * (price.in ?? 0) + ((r.outputTokens ?? 0) / 1000) * (price.out ?? 0);
    }
    return {
      modelId: r.modelId,
      providerId: r.providerId,
      requests: r.requests ?? 0,
      inputTokens: r.inputTokens ?? 0,
      outputTokens: r.outputTokens ?? 0,
      totalTokens: r.totalTokens ?? 0,
      costUsd,
    };
  });
}

export interface TimeSeriesPoint {
  ts: string;
  requests: number;
  totalTokens: number;
}

export function getTimeSeries(
  fromMs: number,
  toMs: number,
  granularity: "hour" | "day" = "day",
  filters?: { keyId?: string; modelId?: string }
): TimeSeriesPoint[] {
  const expr = granularity === "hour"
    ? sql`strftime('%Y-%m-%d %H:00', datetime(${usageLogs.createdAt} / 1000, 'unixepoch'))`
    : sql`strftime('%Y-%m-%d', datetime(${usageLogs.createdAt} / 1000, 'unixepoch'))`;

  const cond: SQL[] = [sql`${usageLogs.createdAt} >= ${fromMs}`, sql`${usageLogs.createdAt} <= ${toMs}`];
  if (filters?.keyId) cond.push(eq(usageLogs.apiKeyId, filters.keyId));
  if (filters?.modelId) cond.push(eq(usageLogs.modelId, filters.modelId));

  const rows = db
    .select({
      ts: expr.as("ts"),
      requests: sql<number>`count(*)`.as("requests"),
      totalTokens: sql<number>`sum(${usageLogs.totalTokens})`.as("total"),
    })
    .from(usageLogs)
    .where(and(...cond))
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
  filters?: { apiKeyId?: string; modelId?: string; statusCode?: number; statusClass?: number }
): UsageLog[] {
  const cond: SQL[] = buildLogFilters(filters);

  return db
    .select()
    .from(usageLogs)
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(usageLogs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
}

function buildLogFilters(filters?: { apiKeyId?: string; modelId?: string; statusCode?: number; statusClass?: number }): SQL[] {
  const cond: SQL[] = [];
  if (filters?.apiKeyId) cond.push(eq(usageLogs.apiKeyId, filters.apiKeyId));
  if (filters?.modelId) cond.push(eq(usageLogs.modelId, filters.modelId));
  if (filters?.statusCode != null) cond.push(eq(usageLogs.statusCode, filters.statusCode));
  if (filters?.statusClass != null) {
    const lo = filters.statusClass * 100;
    cond.push(sql`${usageLogs.statusCode} >= ${lo} AND ${usageLogs.statusCode} < ${lo + 100}`);
  }
  return cond;
}

/** Tổng số log khớp filter — cho pagination trên dashboard. */
export function countLogs(filters?: { apiKeyId?: string; modelId?: string; statusCode?: number; statusClass?: number }): number {
  const cond = buildLogFilters(filters);

  const row = db
    .select({ n: sql<number>`count(*)`.as("n") })
    .from(usageLogs)
    .where(cond.length > 0 ? and(...cond) : undefined)
    .get();
  return row?.n ?? 0;
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
