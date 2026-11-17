import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { verifyApiKey } from "../services/keys.js";
import { resolveRoute } from "../services/routing.js";
import { checkLimits } from "../services/rate-limit.js";
import { listModels } from "../services/models.js";
import { fetchCompletion, pipeStreaming } from "../providers/openai-compatible.js";
import { logUsage } from "../services/usage.js";
import { openAIErrorBody } from "../lib/errors.js";
import { nanoid } from "nanoid";
import { MAX_BODY_BYTES } from "../config/constants.js";
import type { ChatCompletionRequest, ChatCompletionResponse, EmbeddingsResponse } from "../types/openai.js";

type Variables = { apiKey: Awaited<ReturnType<typeof verifyApiKey>>; modelWhitelist: string[] };
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
      return c.json(openAIErrorBody(401, "Monthly quota exceeded", "insufficient_quota"), 401);
    }
    return c.json(openAIErrorBody(429, limits.message ?? "Rate limit exceeded", "rate_limit_exceeded"), 429);
  }

  c.set("apiKey", apiKey);
  c.set("modelWhitelist", JSON.parse(apiKey.modelWhitelist) as string[]);
  await next();
});

v1.get("/models", (c) => {
  const models = listModels(true).map((m) => ({
    id: m.exposedId,
    object: "model",
    created: Math.floor(m.createdAt / 1000),
    owned_by: "nexgate",
  }));
  return c.json({ object: "list", data: models });
});

v1.post("/chat/completions", async (c) => {
  const bodyRaw = await c.req.text();

  if (bodyRaw.length > MAX_BODY_BYTES) {
    return c.json(openAIErrorBody(413, "Payload too large", "body_too_large") as Record<string, unknown>, 413);
  }

  let body: ChatCompletionRequest;
  try {
    body = JSON.parse(bodyRaw);
  } catch {
    return c.json(openAIErrorBody(422, "Invalid JSON body", "invalid_json") as Record<string, unknown>, 422);
  }

  const wl: string[] = c.get("modelWhitelist");
  if (wl.length > 0 && !wl.includes(body.model)) {
    return c.json(openAIErrorBody(403, `Model '${body.model}' not allowed`, "model_not_allowed") as Record<string, unknown>, 403);
  }

  const route = resolveRoute(body.model);
  if (!route) {
    return c.json(openAIErrorBody(404, `Unknown model: ${body.model}`, "model_not_found") as Record<string, unknown>, 404);
  }

  const start = Date.now();
  const requestId = nanoid(12);
  const key = c.get("apiKey")!;
  const isStream = body.stream === true;

  try {
    if (isStream) {
      const { response, abortController } = await pipeStreaming(
        route.upstreamBaseUrl,
        route.upstreamApiKey,
        { ...body, model: route.upstreamModelId }
      );

      c.req.raw.signal?.addEventListener("abort", () => abortController.abort());

      const headers = new Headers();
      headers.set("Content-Type", response.headers.get("content-type") ?? "text/event-stream");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");
      return new Response(response.body, { status: response.status, headers });
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
    return c.json(openAIErrorBody(status, err.message, code) as Record<string, unknown>, status);
  }
});

v1.post("/embeddings", async (c) => {
  const bodyRaw = await c.req.text();
  let body: { model: string; input: string | string[] };
  try {
    body = JSON.parse(bodyRaw);
  } catch {
    return c.json(openAIErrorBody(422, "Invalid JSON body", "invalid_json") as Record<string, unknown>, 422);
  }

  const route = resolveRoute(body.model);
  if (!route) {
    return c.json(openAIErrorBody(404, `Unknown model: ${body.model}`, "model_not_found") as Record<string, unknown>, 404);
  }

  const start = Date.now();
  const key = c.get("apiKey")!;

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
