import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── providers ───────────────────────────────────────────────────────────────
export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  apiKeyEnc: text("api_key_enc").notNull(), // AES-256-GCM encrypted
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ── models ───────────────────────────────────────────────────────────────────
export const models = sqliteTable("models", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exposedId: text("exposed_id").notNull().unique(),
  providerId: text("provider_id").notNull().references(() => providers.id),
  upstreamModelId: text("upstream_model_id").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  maxTokens: integer("max_tokens"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ── api_keys ─────────────────────────────────────────────────────────────────
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(), // SHA-256 of full key
  keyPrefix: text("key_prefix").notNull(),     // "sk-nex_abcd12"
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  modelWhitelist: text("model_whitelist").notNull().default("[]"), // JSON string[]
  quotaTokens: integer("quota_tokens"),
  quotaResetDay: integer("quota_reset_day").notNull().default(1),
  rateLimitPerMin: integer("rate_limit_per_min"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  expiresAt: integer("expires_at"),
});

// ── usage_logs ───────────────────────────────────────────────────────────────
export const usageLogs = sqliteTable("usage_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  apiKeyId: text("api_key_id").notNull().references(() => apiKeys.id),
  modelId: text("model_id").notNull(),
  providerId: text("provider_id").notNull(),
  requestId: text("request_id").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  statusCode: integer("status_code").notNull().default(0),
  errorCode: text("error_code"),
  streamed: integer("streamed", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ── admins ───────────────────────────────────────────────────────────────────
export const admins = sqliteTable("admins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ── audit_logs (optional, v1.0) ──────────────────────────────────────────────
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adminId: integer("admin_id").references(() => admins.id),
  action: text("action").notNull(),
  target: text("target"),
  ip: text("ip"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ── Types (Drizzle inference) ────────────────────────────────────────────────
export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
export type Model = typeof models.$inferSelect;
export type NewModel = typeof models.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type UsageLog = typeof usageLogs.$inferSelect;
export type NewUsageLog = typeof usageLogs.$inferInsert;
export type Admin = typeof admins.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
