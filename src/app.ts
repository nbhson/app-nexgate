import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
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

// Dashboard SPA — serve built assets
const spa = serveStatic({ root: "./dashboard/dist" });
app.use("/", (c) => serveStatic({ root: "./dashboard/dist" })(c, async () => {}));

// SPA fallback: mọi GET route chưa match → index.html
app.get("*", (c) => {
  return (serveStatic({ root: "./dashboard/dist", rewriteRequestPath: () => "/index.html" }))(c, async () => {});
});

export function start() {
  serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
    logger.info(`${APP_NAME} listening at http://${env.HOST}:${info.port}`);
    logger.info(`Health: http://${env.HOST}:${info.port}/healthz`);
    logger.info(`Dashboard: http://${env.HOST}:${info.port}/admin`);
  });
}
