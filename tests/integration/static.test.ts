import { describe, it, expect } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { app } from "../../src/app.js";

const BASE = "http://127.0.0.1:3099";
const spaRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../dashboard/dist");
const assetsDir = resolve(spaRoot, "assets");
const built = existsSync(assetsDir);

const assetFile = (ext: string) =>
  built ? readdirSync(assetsDir).find((f) => f.endsWith(ext)) ?? null : null;

describe("Dashboard static serving", () => {
  it("GET / trả về HTML của SPA", async () => {
    const res = await app.fetch(new Request(`${BASE}/`), { env: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  // Regression: serveStatic từng mount bằng app.use("/") nên chỉ match đúng root,
  // mọi /assets/* rơi xuống SPA fallback và trả text/html -> browser chặn module script.
  it.skipIf(!built)("GET /assets/*.js trả text/javascript (không phải text/html)", async () => {
    const js = assetFile(".js");
    expect(js).toBeTruthy();
    const res = await app.fetch(new Request(`${BASE}/assets/${js}`), { env: {} });
    expect(res.status).toBe(200);
    const type = res.headers.get("Content-Type") ?? "";
    expect(type).toMatch(/javascript/);
    expect(type).not.toContain("text/html");
  });

  it.skipIf(!built)("GET /assets/*.css trả text/css", async () => {
    const css = assetFile(".css");
    expect(css).toBeTruthy();
    const res = await app.fetch(new Request(`${BASE}/assets/${css}`), { env: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/css/);
  });

  it("GET /models (deep-link SPA, không có file) → fallback index.html", async () => {
    const res = await app.fetch(new Request(`${BASE}/models`), { env: {} });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("GET /admin → 302 về / (SPA ở root, /admin là namespace API)", async () => {
    const res = await app.fetch(new Request(`${BASE}/admin`), { env: {} });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/");
  });

  // Regression: fallback từng nuốt cả /v1 và /admin, trả HTML 200 cho API không tồn tại.
  it("API path không match → JSON 404, không phải HTML", async () => {
    const res = await app.fetch(new Request(`${BASE}/admin/nope`), { env: {} });
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
