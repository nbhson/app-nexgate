#!/usr/bin/env node
/**
 * Re-encrypt tất cả upstream provider keys với DB_MASTER_KEY hiện tại.
 * Chạy sau khi đổi DB_MASTER_KEY.
 *
 *   npm run db:rekey
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import "../src/db/client.js";
import { listProviders } from "../src/services/providers.js";
import { encryptSecret, decryptSecret } from "../src/security/crypto.js";
import { logger } from "../src/lib/logger.js";

// Load .env (đảm bảo DB_MASTER_KEY mới được đặt)
const envPath = resolve(fileURLToPath(new URL("..", import.meta.url)), ".env");
try {
  const parsed = parse(readFileSync(envPath, "utf8"));
  for (const [k, v] of Object.entries(parsed)) if (v) process.env[k] = v;
} catch {
  /* không có .env → dùng env môi trường */
}

const { env } = await import("../src/config/env.js");
if (!env.DB_MASTER_KEY) {
  logger.error("DB_MASTER_KEY không được đặt trong .env");
  process.exit(1);
}

const providers = listProviders();
let ok = 0;
let failed = 0;

for (const p of providers) {
  if (!p.apiKeyEnc) continue; // provider không dùng key — bỏ qua
  const plain = decryptSecret(p.apiKeyEnc);
  if (plain === null) {
    logger.error({ provider: p.id }, "Không thể giải mã (key cũ có thể đã bị đổi sai)");
    failed++;
    continue;
  }
  const reEnc = encryptSecret(plain);
  const { updateProvider } = await import("../src/services/providers.js");
  updateProvider(p.id, { apiKeyEnc: reEnc });
  ok++;
  logger.info({ provider: p.id }, "Re-encrypted");
}

logger.info(`Done: ${ok} re-encrypted, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
