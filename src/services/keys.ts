import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { apiKeys, usageLogs } from "../db/schema.js";
import { sha256Hex } from "../security/crypto.js";
import { generateClientKey, clientKeyPrefix } from "../security/hash.js";
import { nanoid } from "nanoid";
import { defaultQuotaTokens } from "./settings.js";
import type { ApiKey, NewApiKey } from "../db/schema.js";

export type { ApiKey };

export function parseWhitelist(json: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(json ?? "[]");
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Model này có dùng được với key không?
 * - 2 whitelist đều trống → cho mọi model (mặc định cũ).
 * - model nằm trong modelWhitelist → cho.
 * - provider của model nằm trong providerWhitelist → cho (model mới thêm vào provider đó tự được phép).
 */
export function modelAllowedFor(
  key: Pick<ApiKey, "modelWhitelist" | "providerWhitelist">,
  model: { exposedId: string; providerId: string }
): boolean {
  const models = parseWhitelist(key.modelWhitelist);
  const providers = parseWhitelist(key.providerWhitelist);
  if (models.length === 0 && providers.length === 0) return true;
  if (models.includes(model.exposedId)) return true;
  if (providers.includes(model.providerId)) return true;
  return false;
}

export function verifyApiKey(rawKey: string): ApiKey | null {
  const hash = sha256Hex(rawKey);
  const rows = db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).all();
  const key = rows[0] ?? null;
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < Date.now()) return null;
  if (!key.enabled) return null;
  return key;
}

export interface CreateKeyInput {
  name: string;
  modelWhitelist?: string[];
  providerWhitelist?: string[];
  quotaTokens?: number;
  rateLimitPerMin?: number;
  expiresAt?: number;
}

export function createClientKey(input: CreateKeyInput): { key: string; record: ApiKey } {
  const rawKey = generateClientKey();
  const now = Date.now();
  const defaultQuota = defaultQuotaTokens();
  const record: NewApiKey = {
    id: nanoid(16),
    name: input.name,
    keyHash: sha256Hex(rawKey),
    keyPrefix: clientKeyPrefix(rawKey),
    enabled: true,
    modelWhitelist: JSON.stringify(input.modelWhitelist ?? []),
    providerWhitelist: JSON.stringify(input.providerWhitelist ?? []),
    quotaTokens: input.quotaTokens ?? (defaultQuota > 0 ? defaultQuota : null),
    quotaResetDay: 1,
    rateLimitPerMin: input.rateLimitPerMin,
    createdAt: now,
    expiresAt: input.expiresAt,
  };
  db.insert(apiKeys).values(record).run();
  return { key: rawKey, record: record as ApiKey };
}

export function listClientKeys(): ApiKey[] {
  return db.select().from(apiKeys).orderBy(apiKeys.createdAt).all();
}

export function getClientKey(id: string): ApiKey | null {
  return db.select().from(apiKeys).where(eq(apiKeys.id, id)).get() ?? null;
}

export function updateClientKey(id: string, data: Partial<NewApiKey>): ApiKey | null {
  db.update(apiKeys).set(data as Partial<NewApiKey>).where(eq(apiKeys.id, id)).run();
  return getClientKey(id);
}

export function deleteClientKey(id: string): boolean {
  const result = db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
  return result.changes > 0;
}

export function revokeClientKey(id: string): boolean {
  const result = db.update(apiKeys).set({ enabled: false }).where(eq(apiKeys.id, id)).run();
  return result.changes > 0;
}

export function rotateClientKey(id: string): { newKey: string } | null {
  revokeClientKey(id);
  const rawKey = generateClientKey();
  db.update(apiKeys).set({
    keyHash: sha256Hex(rawKey),
    keyPrefix: clientKeyPrefix(rawKey),
    enabled: true,
  }).where(eq(apiKeys.id, id)).run();
  return { newKey: rawKey };
}

// ── quota helpers ──────────────────────────────────────────────────────────
export function getMonthlyUsage(keyId: string, resetDay: number): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const resetDate = new Date(Date.UTC(year, month, resetDay));
  const fromMs = resetDate.getTime() <= now.getTime()
    ? resetDate.getTime()
    : new Date(Date.UTC(year, month - 1, resetDay)).getTime();

  const rows = db
    .select({ total: usageLogs.totalTokens })
    .from(usageLogs)
    .where(and(eq(usageLogs.apiKeyId, keyId), sql`${usageLogs.createdAt} >= ${fromMs}`))
    .all();

  return rows.reduce((sum, r) => sum + (r.total ?? 0), 0);
}

/** Thời điểm key dùng request gần nhất (ms), null nếu chưa dùng. */
export function getLastUsedAt(keyId: string): number | null {
  const row = db
    .select({ ts: usageLogs.createdAt })
    .from(usageLogs)
    .where(eq(usageLogs.apiKeyId, keyId))
    .orderBy(desc(usageLogs.createdAt))
    .limit(1)
    .get();
  return row?.ts ?? null;
}
