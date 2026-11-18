#!/usr/bin/env node
/**
 * Chạy Cloudflare tunnel trỏ đúng tới PORT đang dùng trong .env.
 * Tránh lỗi hardcode port (server ở 3003 nhưng tunnel chỉ vào 3000).
 *
 *   npm run tunnel
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parse } from "dotenv";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const env = { ...process.env } as Record<string, string | undefined>;

const envPath = resolve(root, ".env");
if (existsSync(envPath)) {
  for (const [k, v] of Object.entries(parse(readFileSync(envPath, "utf8")))) {
    if (v) env[k] = v;
  }
}

const port = env.PORT ?? "3000";
// Luôn dial qua loopback — HOST trong .env có thể là 0.0.0.0 (bind-all) không dùng để gọi được.
const target = `http://127.0.0.1:${port}`;

console.log(`[tunnel] cloudflared -> ${target}`);
const child = spawn("cloudflared", ["tunnel", "--url", target], { stdio: "inherit" });
child.on("error", (err) => {
  console.error(`[tunnel] Không chạy được cloudflared: ${err.message}`);
  console.error("[tunnel] Cài bằng: brew install cloudflared");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
