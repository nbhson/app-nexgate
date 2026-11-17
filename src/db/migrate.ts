import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, getRawDb } from "./client.js";
import { logger } from "../lib/logger.js";

try {
  migrate(db, { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
  logger.info("DB migration applied");
} catch (err) {
  logger.error({ err }, "DB migration failed");
  process.exitCode = 1;
} finally {
  getRawDb().close();
}
