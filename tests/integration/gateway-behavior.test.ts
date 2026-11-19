/**
 * Hành vi gateway sau cải tiến v1.1:
 * - usage được ghi cho CẢ request stream (bug cũ: stream không log → "dùng 2 model chỉ hiện 1")
 * - /v1/models tôn trọng whitelist model + provider của key
 * - quota vượt ngưỡng → 429 insufficient_quota
 * - settings runtime (rate limit mặc định) đổi ngay không cần restart
 * - audit log + PATCH key (clear whitelist)
 *
 * DB: file riêng data/test-gateway.db — set env TRƯỚC khi import app (dynamic import).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { rmSync } from "node:fs";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";

for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`data/test-gateway.db${suffix}`, { force: true });
}
process.env.DATABASE_URL = "file:./data/test-gateway.db";

const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const { db } = await import("../../src/db/client.js");
const { adminSessionSecret } = await import("../../src/config/env.js");
const { SESSION_COOKIE } = await import("../../src/config/constants.js");
const { app } = await import("../../src/app.js");
const { createProvider } = await import("../../src/services/providers.js");
const { createModel } = await import("../../src/services/models.js");
const { createClientKey } = await import("../../src/services/keys.js");
const { logUsage } = await import("../../src/services/usage.js");
const { encryptSecret, sha256Hex } = await import("../../src/security/crypto.js");
const { apiKeys, usageLogs } = await import("../../src/db/schema.js");

const BASE = "http://127.0.0.1:3099";

let p1: { id: string }; // provider 1 — model a, b
let p2: { id: string }; // provider 2 — model c
let kAll: string, kModel: string, kProvider: string, kQuota: string, kRate: string; // raw client keys

function keyIdOf(rawKey: string): string {
  const row = db.select().from(apiKeys).where(eq(apiKeys.keyHash, sha256Hex(rawKey))).get();
  if (!row) throw new Error("key not found");
  return row.id;
}

const countModelLogs = (modelId: string) =>
  db.select().from(usageLogs).where(eq(usageLogs.modelId, modelId)).all().length;

beforeAll(() => {
  migrate(db, { migrationsFolder: "src/db/migrations" });

  p1 = createProvider({ name: "up-one", baseUrl: "http://fake-up1.test/v1", apiKeyEnc: encryptSecret("sk-up-1"), enabled: true });
  p2 = createProvider({ name: "up-two", baseUrl: "http://fake-up2.test/v1", apiKeyEnc: encryptSecret("sk-up-2"), enabled: true });

  createModel({ exposedId: "model-a", providerId: p1.id, upstreamModelId: "up-model-a", enabled: true, maxTokens: null });
  createModel({ exposedId: "model-b", providerId: p1.id, upstreamModelId: "up-model-b", enabled: true, maxTokens: null });
  createModel({ exposedId: "model-c", providerId: p2.id, upstreamModelId: "up-model-c", enabled: true, maxTokens: null });

  kAll = createClientKey({ name: "k-all" }).key;
  kModel = createClientKey({ name: "k-model", modelWhitelist: ["model-a"] }).key;
  kProvider = createClientKey({ name: "k-provider", providerWhitelist: [p2.id] }).key;
  kQuota = createClientKey({ name: "k-quota", quotaTokens: 10 }).key;
  kRate = createClientKey({ name: "k-rate" }).key;

  // fake upstream: non-stream trả usage trong JSON; stream trả SSE với usage ở chunk cuối
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (u.endsWith("/chat/completions") && body.stream === true) {
      const enc = new TextEncoder();
      const sse = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode('data: {"choices":[{"index":0,"delta":{"content":"hello "}}]}\n\n'));
          controller.enqueue(enc.encode('data: {"choices":[{"index":0,"delta":{"content":"world"}}]}\n\n'));
          controller.enqueue(enc.encode('data: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":22,"total_tokens":42}}\n\n'));
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    if (u.endsWith("/chat/completions")) {
      return Response.json({
        id: "gen-test", object: "chat.completion", created: 1, model: body.model,
        choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 },
      });
    }
    if (u.endsWith("/embeddings")) {
      return Response.json({
        object: "list",
        data: [{ object: "embedding", embedding: [0.1], index: 0 }],
        model: body.model,
        usage: { prompt_tokens: 3, completion_tokens: 0, total_tokens: 3 },
      });
    }
    return Response.json({ object: "list", data: [] });
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function v1(path: string, opts: { key?: string; method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return app.fetch(
    new Request(`${BASE}${path}`, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: {
        ...(opts.key ? { Authorization: `Bearer ${opts.key}` } : {}),
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }),
    { env: {} }
  );
}

function chatBody(model: string, stream = false) {
  return { model, messages: [{ role: "user", content: "hi" }], stream };
}

describe("v1 — quyền model theo key (whitelist model + provider)", () => {
  it("/v1/models trả về theo quyền của từng key", async () => {
    const all = await (await v1("/v1/models", { key: kAll })).json();
    expect(all.data.map((m: { id: string }) => m.id).sort()).toEqual(["model-a", "model-b", "model-c"]);

    const byModel = await (await v1("/v1/models", { key: kModel })).json();
    expect(byModel.data.map((m: { id: string }) => m.id)).toEqual(["model-a"]);

    const byProvider = await (await v1("/v1/models", { key: kProvider })).json();
    expect(byProvider.data.map((m: { id: string }) => m.id)).toEqual(["model-c"]);
  });

  it("chat với model ngoài whitelist → 403", async () => {
    const res = await v1("/v1/chat/completions", { key: kModel, body: chatBody("model-b") });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("model_not_allowed");
  });

  it("provider whitelist: model THÊM SAU vẫn tự được phép", async () => {
    createModel({ exposedId: "model-d", providerId: p2.id, upstreamModelId: "up-model-d", enabled: true, maxTokens: null });
    const res = await v1("/v1/chat/completions", { key: kProvider, body: chatBody("model-d") });
    expect(res.status).toBe(200);
  });
});

describe("v1 — usage logging (fix bug stream mất log)", () => {
  it("non-stream ghi usage từ upstream", async () => {
    const before = countModelLogs("model-a");
    const res = await v1("/v1/chat/completions", { key: kAll, body: chatBody("model-a") });
    expect(res.status).toBe(200);
    expect(countModelLogs("model-a")).toBe(before + 1);

    const row = db.select().from(usageLogs).where(eq(usageLogs.modelId, "model-a")).all().at(-1)!;
    expect(row.inputTokens).toBe(7);
    expect(row.outputTokens).toBe(5);
    expect(row.streamed).toBe(false);
  });

  it("STREAM cũng ghi usage — bug cũ khiến 'dùng 2 model chỉ hiện 1'", async () => {
    const before = countModelLogs("model-b");
    const res = await v1("/v1/chat/completions", { key: kAll, body: chatBody("model-b", true) });
    expect(res.status).toBe(200);
    await res.text(); // drain stream để flush usage

    expect(countModelLogs("model-b")).toBe(before + 1);
    const row = db.select().from(usageLogs).where(eq(usageLogs.modelId, "model-b")).all().at(-1)!;
    expect(row.streamed).toBe(true);
    expect(row.inputTokens).toBe(20);
    expect(row.outputTokens).toBe(22);
    expect(row.totalTokens).toBe(42);
    expect(row.errorCode).toBeNull(); // usage thật từ upstream, không phải ước lượng
  });

  it("stream không có usage → ước lượng, gắn cờ usage_estimated", async () => {
    // upstream giả tạm thời stream không kèm usage chunk
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (_u: string | URL, _i?: RequestInit) => {
      const enc = new TextEncoder();
      const sse = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode('data: {"choices":[{"index":0,"delta":{"content":"aaaaaaaaaa"}}]}\n\n'));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        },
      });
      return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }));
    try {
      const res = await v1("/v1/chat/completions", { key: kAll, body: chatBody("model-a", true) });
      await res.text();
      const row = db.select().from(usageLogs).where(eq(usageLogs.modelId, "model-a")).all().at(-1)!;
      expect(row.streamed).toBe(true);
      expect(row.errorCode).toBe("usage_estimated");
      expect(row.outputTokens).toBeGreaterThan(0);
    } finally {
      vi.stubGlobal("fetch", realFetch);
    }
  });

  it("embeddings tôn trọng whitelist + ghi usage", async () => {
    expect((await v1("/v1/embeddings", { key: kModel, body: { model: "model-c", input: "x" } })).status).toBe(403);

    const ok = await v1("/v1/embeddings", { key: kAll, body: { model: "model-a", input: "x" } });
    expect(ok.status).toBe(200);
    const row = db.select().from(usageLogs).where(eq(usageLogs.modelId, "model-a")).all().at(-1)!;
    expect(row.totalTokens).toBe(3);
  });

  it("vượt quota tháng → 429 insufficient_quota", async () => {
    logUsage({
      apiKeyId: keyIdOf(kQuota), modelId: "model-c", providerId: p2.id, requestId: "seed-1",
      inputTokens: 50, outputTokens: 60, totalTokens: 110, latencyMs: 5, statusCode: 200, streamed: true,
    });
    const res = await v1("/v1/chat/completions", { key: kQuota, body: chatBody("model-a") });
    expect(res.status).toBe(429);
    expect((await res.json()).error.code).toBe("insufficient_quota");
  });
});

describe("admin — session, settings runtime, audit", () => {
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

  it("settings yêu cầu đăng nhập", async () => {
    expect((await app.fetch(new Request(`${BASE}/admin/settings`), { env: {} })).status).toBe(401);
  });

  it("PUT /admin/settings cập nhật giá trị hiệu dụng + validate", async () => {
    const items1 = (await (await adminFetch("/admin/settings")).json()).data;
    expect(items1.find((x: { key: string }) => x.key === "rateLimitDefault").overridden).toBe(false);

    const items2 = (await (await adminFetch("/admin/settings", "PUT", { rateLimitDefault: 2 })).json()).data;
    const updated = items2.find((x: { key: string }) => x.key === "rateLimitDefault");
    expect(updated.value).toBe(2);
    expect(updated.overridden).toBe(true);

    expect((await adminFetch("/admin/settings", "PUT", { nope: 1 })).status).toBe(400);
  });

  it("rate limit mặc định từ settings áp dụng ngay + Retry-After", async () => {
    // rateLimitDefault = 2 (test trước, cùng module state)
    await v1("/v1/chat/completions", { key: kRate, body: chatBody("model-a") });
    await v1("/v1/chat/completions", { key: kRate, body: chatBody("model-a") });
    const c = await v1("/v1/chat/completions", { key: kRate, body: chatBody("model-a") });
    expect(c.status).toBe(429);
    expect(c.headers.get("retry-after")).toBeTruthy();
    expect((await c.json()).error.code).toBe("rate_limit_exceeded");

    // khôi phục limit cao để các test sau không bị throttle
    await adminFetch("/admin/settings", "PUT", { rateLimitDefault: 5000 });
  });

  it("PATCH key cho phép clear whitelist", async () => {
    const list = (await (await adminFetch("/admin/keys")).json()).data;
    const k = list.find((x: { name: string }) => x.name === "k-model");
    expect(JSON.parse(k.modelWhitelist)).toEqual(["model-a"]);

    const rec = (await (await adminFetch(`/admin/keys/${k.id}`, "PATCH", { modelWhitelist: [] })).json()).data;
    expect(JSON.parse(rec.modelWhitelist)).toEqual([]);

    // key giờ thấy mọi model còn lại
    const ids = (await (await v1("/v1/models", { key: kModel })).json()).data.map((m: { id: string }) => m.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);
  });

  it("audit log ghi nhận hành động admin", async () => {
    const logs = (await (await adminFetch("/admin/audit?limit=50")).json()).data as Array<{ action: string }>;
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("settings.update");
    expect(actions).toContain("key.update");
  });

  it("list keys có quotaUsed + lastUsedAt cho dashboard", async () => {
    const list = (await (await adminFetch("/admin/keys")).json()).data as Array<Record<string, unknown>>;
    const k = list.find((x) => x.name === "k-all")!;
    expect(typeof k.quotaUsed).toBe("number");
    expect("lastUsedAt" in k).toBe(true);
  });

  it("usage breakdown theo model (đủ 2 model sau khi dùng cả 2)", async () => {
    const rows = (await (await adminFetch("/admin/usage/models")).json()).data as Array<{ modelId: string }>;
    const ids = rows.map((r) => r.modelId);
    expect(ids).toContain("model-a");
    expect(ids).toContain("model-b");
  });
});
