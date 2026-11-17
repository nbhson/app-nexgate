import { env } from "../config/env.js";
import { upstreamUnavailable, upstreamTimeout, notFound } from "../lib/errors.js";
import type { ChatCompletionRequest } from "../types/openai.js";
import { logger } from "../lib/logger.js";

/** Gọi upstream chat completions (non-stream). */
export async function fetchCompletion(upstreamUrl: string, upstreamKey: string, body: ChatCompletionRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.UPSTREAM_READ_TIMEOUT_MS);

  try {
    const res = await fetch(`${upstreamUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${upstreamKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const msg = await res.text().catch(() => "upstream error");
      logger.error({ status: res.status, msg }, "upstream error");
      throw upstreamUnavailable(`Upstream error ${res.status}: ${msg.slice(0, 120)}`);
    }
    return res;
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === "AbortError") {
      throw upstreamTimeout("Upstream request timed out");
    }
    throw e;
  }
}

/** Proxy upstream response stream tới client (passthrough không buffer). */
export async function pipeStreaming(upstreamUrl: string, upstreamKey: string, body: ChatCompletionRequest) {
  const controller = new AbortController();

  const res = await fetch(`${upstreamUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${upstreamKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "upstream error");
    logger.error({ status: res.status }, "upstream stream error");
    throw upstreamUnavailable(`Upstream error ${res.status}: ${msg.slice(0, 120)}`);
  }

  return { response: res, abortController: controller };
}

/** Test kết nối upstream bằng /v1/models. */
export async function testUpstream(upstreamUrl: string, upstreamKey: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(`${upstreamUrl.replace(/\/+$/, "")}/models`, {
      headers: { Authorization: `Bearer ${upstreamKey}` },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    if (res.ok) return { ok: true, latencyMs };
    return { ok: false, latencyMs, error: `HTTP ${res.status}` };
  } catch (e: unknown) {
    const latencyMs = Date.now() - start;
    return { ok: false, latencyMs, error: e instanceof Error ? e.message : String(e) };
  }
}
