import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { admins, providers } from "./schema.js";
import { env } from "../config/env.js";
import { encryptSecret } from "../security/crypto.js";
import { hashPassword } from "../security/hash.js";
import { nanoid } from "nanoid";
import { logger } from "../lib/logger.js";

export async function seed(): Promise<void> {
  // Admin mặc định
  const adminCount = db.select().from(admins).all().length;
  let adminCreated = false;
  if (adminCount === 0 && env.ADMIN_PASSWORD_HASH) {
    await db.insert(admins).values({
      username: env.ADMIN_USERNAME,
      passwordHash: env.ADMIN_PASSWORD_HASH,
    });
    adminCreated = true;
    logger.info("Seeded admin user: %s", env.ADMIN_USERNAME);
  }

  // Upstream provider mặc định từ env (nếu có và chưa có provider nào) — key tuỳ chọn (local AI)
  const providerCount = db.select().from(providers).all().length;
  if (providerCount === 0 && env.UPSTREAM_BASE_URL) {
    const now = Date.now();
    await db.insert(providers).values({
      id: nanoid(16),
      name: "default-provider",
      baseUrl: env.UPSTREAM_BASE_URL,
      apiKeyEnc: env.UPSTREAM_API_KEY ? encryptSecret(env.UPSTREAM_API_KEY) : "",
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    logger.info("Seeded default upstream provider: %s", env.UPSTREAM_BASE_URL);
  }

  if (adminCount === 0 && !adminCreated) {
    logger.warn(
      "Chưa có admin. Bạn phải set ADMIN_PASSWORD_HASH trong .env (xem .env.example)."
    );
  }
}

// Chạy trực tiếp: npx tsx src/db/seed.ts
if (process.argv[1] && process.argv[1].includes("seed")) {
  seed()
    .then(() => {
      logger.info("Seed done");
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, "Seed failed");
      process.exit(1);
    });
}

export async function getAdminByUsername(username: string) {
  const rows = db.select().from(admins).where(eq(admins.username, username)).all();
  return rows[0] ?? null;
}
