import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { verifyApiKey, parseWhitelist, modelAllowedFor } from "../services/keys.js";
import { resolveRoute } from "../services/routing.js";
import { checkLimits } from "../services/rate-limit.js";
import { listModels, getModelByExposedId } from "../services/models.js";
import { fetchCompletion, pipeStreaming } from "../providers/openai-compatible.js";
import { trackCompletionStream, estimateTokensFromText } from "../providers/stream-usage.js";
import { logUsage } from "../services/usage.js";
import { openAIErrorBody } from "../lib/errors.js";
import { nanoid } from "nanoid";
import { maxBodyBytes, streamIncludeUsage } from "../services/settings.js";
import { logger } from "../lib/logger.js";
import type { ChatCompletionRequest, ChatCompletionResponse, EmbeddingsResponse } from "../types/openai.js";

type Variables = { apiKey: Awaited<ReturnType<typeof verifyApiKey>> };
export const v1 = new Hono<{ Variables: Variables }>();

v1.use("*", async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7) : auth;

  if (!raw) {
    return c.json(openAIErrorBody(401, "Missing API key", "invalid_api_key"), 401);
  }

  const apiKey = verifyApiKey(raw);
  if (!apiKey) {
    return c.json(openAIErrorBody(401, "Invalid or disabled API key", "invalid_api_key"), 401);
  }

  const limits = checkLimits(apiKey);
  if (!limits.ok) {
    if (limits.reason === "quota") {
      // Chuẩn OpenAI: vượt quota là 429 insufficient_quota (không phải 401).
      c.header("Retry-After", String(3600));
      return c.json(openAIErrorBody(429, "Monthly quota exceeded", "insufficient_quota"), 429);
    }
    c.header("Retry-After", String(limits.retryAfterSec ?? 1));
    return c.json(openAIErrorBody(429, limits.message ?? "Rate limit exceeded", "rate_limit_exceeded"), 429);
  }

  c.set("apiKey", apiKey);
  await next();
});

/** Model client nhìn thấy được: enabled + key có quyền dùng (whitelist model/provider). */
function visibleModels(apiKey: NonNullable<Awaited<ReturnType<typeof verifyApiKey>>>) {
  return listModels(true).filter((m) => modelAllowedFor(apiKey, m));
}

v1.get("/models", (c) => {
  const apiKey = c.get("apiKey")!;
  const models = visibleModels(apiKey).map((m) => ({
    id: m.exposedId,
    object: "model",
    created: Math.floor(m.createdAt / 1000),
    owned_by: "nexgate",
  }));
  return c.json({ object: "list", data: models });
});

/**
 * Kiểm tra truy cập model theo key. Trả về model record nếu hợp lệ,
 * hoặc mô tả lỗi (404 model không tồn tại, 403 không được phép).
 */
function guardModelAccess(body: ChatCompletionRequest, apiKey: NonNullable<Awaited<ReturnType<typeof verifyApiKey>>>):
  | { ok: true; modelId: string }
  | { ok: false; status: 403 | 404; code: string; message: string } {
  const model = getModelByExposedId(body.model);
  if (!model) {
    return { ok: false, status: 404, code: "model_not_found", message: `Unknown model: ${body.model}` };
  }
  if (!modelAllowedFor(apiKey, model)) {
    return { ok: false, status: 403, code: "model_not_allowed", message: `Model '${body.model}' not allowed` };
  }
  return { ok: true, modelId: model.exposedId };
}

function estimateInputTokens(body: ChatCompletionRequest): number {
  try {
    return estimateTokensFromText(JSON.stringify(body.messages ?? []));
  } catch {
    return 0;
  }
}

v1.post("/chat/completions", async (c) => {
  const bodyRaw = await c.req.text();

  if (bodyRaw.length > maxBodyBytes()) {
    return c.json(openAIErrorBody(413, "Payload too large", "body_too_large") as Record<string, unknown>, 413);
  }

  let body: ChatCompletionRequest;
  try {
    body = JSON.parse(bodyRaw);
  } catch {
    return c.json(openAIErrorBody(422, "Invalid JSON body", "invalid_json") as Record<string, unknown>, 422);
  }

  const key = c.get("apiKey")!;
  const access = guardModelAccess(body, key);
  if (!access.ok) {
    return c.json(
      openAIErrorBody(access.status, access.message, access.code) as Record<string, unknown>,
      access.status as ContentfulStatusCode
    );
  }

  const route = resolveRoute(body.model);
  if (!route) {
    return c.json(openAIErrorBody(404, `Unknown model: ${body.model}`, "model_not_found") as Record<string, unknown>, 404);
  }

  const start = Date.now();
  const requestId = nanoid(12);
  const isStream = body.stream === true;

  try {
    if (isStream) {
      // Xin upstream trả usage ở chunk cuối (hầu hết server OpenAI-compatible hỗ trợ;
      // có thể tắt trong Settings nếu upstream lạ reject field này).
      const streamBody: ChatCompletionRequest = streamIncludeUsage() && !body.stream_options
        ? { ...body, stream_options: { include_usage: true } }
        : body;

      const { response, abortController } = await pipeStreaming(
        route.upstreamBaseUrl,
        route.upstreamApiKey,
        { ...streamBody, model: route.upstreamModelId }
      );

      c.req.raw.signal?.addEventListener("abort", () => abortController.abort());

      // FIX bug lớn: stream request KHÔNG được ghi usage trước đây
      // → "dùng 2 model chỉ hiện 1". Bọc SSE stream, lấy usage từ chunk cuối,
      // fallback ước lượng token theo ký tự.
      const tracked = trackCompletionStream(response.body!, {
        estimateInputTokens: estimateInputTokens(body),
        onUsage: (u) => {
          try {
            logUsage({
              apiKeyId: key.id,
              modelId: body.model,
              providerId: route.provider.id,
              requestId,
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
              totalTokens: u.totalTokens,
              latencyMs: Date.now() - start,
              statusCode: 200,
              streamed: true,
              errorCode: u.estimated ? "usage_estimated" : null,
            });
            if (u.estimated) logger.debug({ requestId }, "stream usage estimated (upstream not reporting)");
          } catch {
            /* không để lỗi ghi log làm đứt stream của client */
          }
        },
      });

      const headers = new Headers();
      headers.set("Content-Type", response.headers.get("content-type") ?? "text/event-stream");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      return new Response(tracked, { status: response.status, headers });
    }

    const res = await fetchCompletion(route.upstreamBaseUrl, route.upstreamApiKey, {
      ...body,
      model: route.upstreamModelId,
    });
    const json = (await res.json()) as ChatCompletionResponse;
    const usage = json?.usage;
    logUsage({
      apiKeyId: key.id,
      modelId: body.model,
      providerId: route.provider.id,
      requestId,
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      latencyMs: Date.now() - start,
      statusCode: res.status,
      streamed: false,
    });

    return c.json(json, res.status as ContentfulStatusCode);
  } catch (e: unknown) {
    const err = e as Error & { status?: number; code?: string };
    const status = (err.status ?? 502) as ContentfulStatusCode;
    const code = err.code ?? "upstream_unavailable";
    try {
      logUsage({
        apiKeyId: key.id,
        modelId: body.model,
        providerId: route.provider.id,
        requestId,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs: Date.now() - start,
        statusCode: status,
        streamed: isStream,
        errorCode: code,
      });
    } catch {
      /* logging lỗi không được phép che response lỗi upstream */
    }
    return c.json(openAIErrorBody(status, err.message, code) as Record<string, unknown>, status);
  }
});

v1.post("/embeddings", async (c) => {
  const bodyRaw = await c.req.text();

  if (bodyRaw.length > maxBodyBytes()) {
    return c.json(openAIErrorBody(413, "Payload too large", "body_too_large") as Record<string, unknown>, 413);
  }

  let body: { model: string; input: string | string[] };
  try {
    body = JSON.parse(bodyRaw);
  } catch {
    return c.json(openAIErrorBody(422, "Invalid JSON body", "invalid_json") as Record<string, unknown>, 422);
  }

  // FIX: embeddings trước đây bỏ qua whitelist của key
  const key = c.get("apiKey")!;
  const model = getModelByExposedId(body.model);
  if (!model) {
    return c.json(openAIErrorBody(404, `Unknown model: ${body.model}`, "model_not_found") as Record<string, unknown>, 404);
  }
  if (!modelAllowedFor(key, model)) {
    return c.json(openAIErrorBody(403, `Model '${body.model}' not allowed`, "model_not_allowed") as Record<string, unknown>, 403);
  }

  const route = resolveRoute(body.model);
  if (!route) {
    return c.json(openAIErrorBody(404, `Unknown model: ${body.model}`, "model_not_found") as Record<string, unknown>, 404);
  }

  const start = Date.now();

  try {
    const res = await fetch(`${route.upstreamBaseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${route.upstreamApiKey}`,
      },
      body: JSON.stringify({ ...body, model: route.upstreamModelId }),
    });
    const json = (await res.json()) as EmbeddingsResponse;
    const usage = json?.usage;
    logUsage({
      apiKeyId: key.id,
      modelId: body.model,
      providerId: route.provider.id,
      requestId: nanoid(12),
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: 0,
      totalTokens: usage?.total_tokens ?? 0,
      latencyMs: Date.now() - start,
      statusCode: res.status,
      streamed: false,
    });
    return c.json(json, res.status as ContentfulStatusCode);
  } catch (e: unknown) {
    const err = e as Error;
    return c.json(openAIErrorBody(502, err.message, "upstream_unavailable") as Record<string, unknown>, 502);
  }
});
