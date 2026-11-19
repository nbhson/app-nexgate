/**
 * Theo dõi usage trên SSE stream của chat completions.
 *
 * Vấn đề: trước đây request stream không bao giờ được ghi vào usage_logs
 * → Usage/Overview khuyết số liệu và quota không bị trừ.
 *
 * Cách làm: bọc stream passthrough bằng một TransformStream, soi từng dòng SSE:
 * - chunk có `usage` (OpenAI trả ở chunk cuối khi stream_options.include_usage=true) → dùng trực tiếp.
 * - không có usage → ước lượng theo ký tự (~4 ký tự / token).
 * Khi stream kết thúc (hoặc lỗi), callback onUsage được gọi đúng MỘT lần.
 */

export interface StreamUsageResult {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** true khi upstream không trả usage, số liệu là ước lượng theo ký tự. */
  estimated: boolean;
}

export interface TrackOptions {
  /** Số token input ước lượng sẵn (từ messages) — dùng khi upstream không trả usage. */
  estimateInputTokens: number;
  onUsage: (u: StreamUsageResult) => void;
}

const CHARS_PER_TOKEN = 4;

export function estimateTokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

function toTokens(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function trackCompletionStream(
  source: ReadableStream<Uint8Array>,
  opts: TrackOptions
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let lineBuf = "";
  let reported = false;

  let upstreamUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null = null;
  let outChars = 0;

  function ingest(decodedText: string) {
    lineBuf += decodedText;
    let nl: number;
    while ((nl = lineBuf.indexOf("\n")) >= 0) {
      const line = lineBuf.slice(0, nl).trim();
      lineBuf = lineBuf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (json.usage && typeof json.usage === "object") {
        upstreamUsage = json.usage as typeof upstreamUsage;
      }
      const choices = Array.isArray(json.choices) ? json.choices : [];
      for (const ch of choices) {
        const delta = (ch as Record<string, unknown>)?.delta as Record<string, unknown> | undefined;
        const content = delta?.content;
        if (typeof content === "string") outChars += content.length;
      }
    }
  }

  function report() {
    if (reported) return;
    reported = true;
    const estimated = upstreamUsage == null;
    const inputTokens = toTokens(upstreamUsage?.prompt_tokens, opts.estimateInputTokens);
    const outputTokens = toTokens(upstreamUsage?.completion_tokens, Math.ceil(outChars / CHARS_PER_TOKEN));
    const totalTokens = toTokens(upstreamUsage?.total_tokens, inputTokens + outputTokens);
    opts.onUsage({ inputTokens, outputTokens, totalTokens, estimated });
  }

  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(chunk); // passthrough trước — không chặn/đệm stream
        ingest(decoder.decode(chunk, { stream: true }));
      },
      flush() {
        report();
      },
    })
  );
}
