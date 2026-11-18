import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { env } from "./config/env.js";
import { APP_NAME, APP_VERSION } from "./config/constants.js";
import { logger } from "./lib/logger.js";
import { v1 } from "./routes/v1.js";
import { admin } from "./routes/admin/index.js";

export const app = new Hono();

// security headers
app.use("*", async (c, next) => {
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  await next();
});

app.get("/healthz", (c) => {
  return c.json({ status: "ok", version: APP_VERSION, db: "up", uptime: process.uptime() });
});

// API routes
app.route("/v1", v1);
app.route("/admin", admin);

// /admin là prefix của Admin API (/admin/auth, /admin/models...), còn SPA serve ở root (/).
// Redirect đúng path /admin về / để link cũ trong docs/log không bị 404.
app.get("/admin", (c) => c.redirect("/", 302));
app.get("/admin/", (c) => c.redirect("/", 302));

// API paths — không bao giờ bị static/SPA fallback xử lý
const API_PREFIXES = ["/v1", "/admin", "/healthz"];
const isApiPath = (path: string) =>
  API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`));

// Dashboard SPA — serve built assets.
// root là đường dẫn TƯƠNG ĐỐI theo cwd nên sẽ hỏng khi chạy qua pm2/cwd khác.
// Resolve tuyệt đối từ vị trí module: dist/app.js -> <projectRoot>/dashboard/dist
const spaRoot = fileURLToPath(new URL("../dashboard/dist", import.meta.url));

const spaStatic = serveStatic({ root: spaRoot });
const spaIndex = serveStatic({ root: spaRoot, path: "index.html" });

// File tĩnh thật (/, /assets/*, favicon...) — bỏ qua route API
app.use("/*", async (c, next) => {
  if (isApiPath(c.req.path)) return next();
  return spaStatic(c, next);
});

// SPA fallback: route GET không match file nào -> index.html (client-side routing)
app.get("*", async (c) => {
  if (isApiPath(c.req.path)) {
    return c.json({ error: { code: "NOT_FOUND", message: `Không tìm thấy: ${c.req.path}` } }, 404);
  }
  // index.html thiếu (chưa build dashboard) -> next() -> 404 mặc định của Hono
  return spaIndex(c, async () => {});
});

export function start() {
  serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
    logger.info(`${APP_NAME} listening at http://${env.HOST}:${info.port}`);
    logger.info(`Health: http://${env.HOST}:${info.port}/healthz`);
    logger.info(`Dashboard: http://${env.HOST}:${info.port}/`);
  });
}
