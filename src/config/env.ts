import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("127.0.0.1"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  DATABASE_URL: z.string().default("file:./data/nexgate.db"),
  DB_MASTER_KEY: z.string().min(1).optional(),

  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),

  UPSTREAM_BASE_URL: z.string().optional(),
  UPSTREAM_API_KEY: z.string().optional(),

  RATE_LIMIT_DEFAULT: z.coerce.number().int().nonnegative().default(60),
  CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(5),
  MAX_BODY_SIZE_MB: z.coerce.number().positive().default(32),
  UPSTREAM_CONNECT_TIMEOUT_MS: z.coerce.number().positive().default(10_000),
  UPSTREAM_READ_TIMEOUT_MS: z.coerce.number().positive().default(120_000),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

/** Master key (base64 32 bytes) cho AES-GCM. Nếu thiếu -> dùng secret fallback dev-only. */
export function masterKey(): Buffer {
  if (env.DB_MASTER_KEY) {
    const buf = Buffer.from(env.DB_MASTER_KEY, "base64");
    if (buf.length < 32) throw new Error("DB_MASTER_KEY phải đủ 32 bytes base64");
    return buf.subarray(0, 32);
  }
  // fallback chỉ cho development/test — CẢNH BÁO rõ ràng
  if (env.NODE_ENV !== "production") {
    return Buffer.from("nexgate-dev-master-key-not-secure-32b!", "utf8").subarray(0, 32);
  }
  throw new Error("DB_MASTER_KEY bắt buộc phải đặt ở production");
}

export function adminSessionSecret(): string {
  if (env.ADMIN_SESSION_SECRET) return env.ADMIN_SESSION_SECRET;
  if (env.NODE_ENV !== "production") return "nexgate-dev-session-secret";
  throw new Error("ADMIN_SESSION_SECRET bắt buộc phải đặt ở production");
}
