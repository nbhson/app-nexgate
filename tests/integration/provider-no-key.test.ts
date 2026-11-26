/**
 * Provider KHÔNG có API key (local AI — ollama/lmstudio):
 * - POST /admin/providers không cần apiKey → 201, apiKeyEnc trả về ""
 * - getProviderDecrypted → apiKey "" (không phải null), resolveRoute vẫn hoạt động
 * - PATCH apiKey: null → xoá key
 * - Danh sách admin không lộ key thật
 *
 * DB: file riêng data/test-nokey.db — set env TRƯỚC khi import app.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { rmSync } from "node:fs";
import { createHmac } from "node:crypto";

for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`data/test-nokey.db${suffix}`, { force: true });
}
process.env.DATABASE_URL = "file:./data/test-nokey.db";

const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const { db } = await import("../../src/db/client.js");
const { adminSessionSecret } = await import("../../src/config/env.js");
const { SESSION_COOKIE } = await import("../../src/config/constants.js");
const { app } = await import("../../src/app.js");
const { createProvider, getProviderDecrypted } = await import("../../src/services/providers.js");
const { createModel } = await import("../../src/services/models.js");
const { resolveRoute } = await import("../../src/services/routing.js");

const BASE = "http://127.0.0.1:3098";

function adminCookie(): string {
  const secret = adminSessionSecret();
  const payload = `testadmin:${Date.now()}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

const adminFetch = (path: string, method = "GET", body?: unknown) =>
  app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE}=${adminCookie()}` },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { env: {} }
  );

beforeAll(() => {
  migrate(db, { migrationsFolder: "src/db/migrations" });
});

describe("provider không cần API key (local AI)", () => {
  let created: { id: string; apiKeyEnc: string };

  it("POST không có apiKey vẫn tạo được provider", async () => {
    const res = await adminFetch("/admin/providers", "POST", {
      name: "ollama-local",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    created = data;
    expect(data.apiKeyEnc).toBe("");
  });

  it("GET/:id trả về key rỗng, không lộ bí mật", async () => {
    const { data } = await (await adminFetch(`/admin/providers/${created.id}`)).json();
    expect(data.apiKeyEnc).toBe("");
  });

  it("danh sách mask key thật của provider có key thành [encrypted]", async () => {
    const p = createProvider({
      name: "with-key",
      baseUrl: "http://fake.test/v1",
      apiKeyEnc: "opaque-enc-value",
      enabled: true,
    });
    const { data } = await (await adminFetch("/admin/providers")).json();
    const mine = data.find((x: { id: string }) => x.id === p.id);
    expect(mine.apiKeyEnc).toBe("[encrypted]");
  });

  it("getProviderDecrypted + resolveRoute trả apiKey '' thay vì null", () => {
    const p = createProvider({ name: "local2", baseUrl: "http://local2.test/v1", apiKeyEnc: "", enabled: true });
    const d = getProviderDecrypted(p.id);
    expect(d).not.toBeNull();
    expect(d!.apiKey).toBe("");

    createModel({ exposedId: "local-model", providerId: p.id, upstreamModelId: "", enabled: true, maxTokens: null });
    const route = resolveRoute("local-model");
    expect(route).not.toBeNull();
    expect(route!.upstreamApiKey).toBe("");
  });

  it("PATCH apiKey:null xoá key đã lưu", async () => {
    const p = createProvider({ name: "del-key", baseUrl: "http://delkey.test/v1", apiKeyEnc: "some-enc", enabled: true });
    const res = await adminFetch(`/admin/providers/${p.id}`, "PATCH", { apiKey: null });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.apiKeyEnc).toBe("");
  });
});
