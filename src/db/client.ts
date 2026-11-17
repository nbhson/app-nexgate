import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

// Đảm bảo thư mục data tồn tại cho file:./data/nexgate.db
if (env.DATABASE_URL.startsWith("file:")) {
  const dbPath = env.DATABASE_URL.replace(/^file:/, "");
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
  } catch {
    /* ignore */
  }
}

const sqlite = new Database(env.DATABASE_URL.replace(/^file:/, ""), {
  readonly: false,
});
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function getRawDb(): Database.Database {
  return sqlite;
}

export function closeDb(): void {
  sqlite.close();
}
