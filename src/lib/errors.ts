export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  getResponse(): Response {
    const body = JSON.stringify({
      error: { message: this.message, type: this.status >= 500 ? "upstream_error" : "invalid_request_error", code: this.code },
    });
    return new Response(body, {
      status: this.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export function badRequest(message: string): ApiError {
  return new ApiError(400, "bad_request", message);
}

export function unauthorized(message = "Xác thực thất bại"): ApiError {
  return new ApiError(401, "invalid_api_key", message);
}

export function forbidden(message: string): ApiError {
  return new ApiError(403, "forbidden", message);
}

export function notFound(message: string): ApiError {
  return new ApiError(404, "not_found", message);
}

export function upstreamUnavailable(message: string): ApiError {
  return new ApiError(502, "upstream_unavailable", message);
}

export function upstreamTimeout(message: string): ApiError {
  return new ApiError(504, "upstream_timeout", message);
}

export function openAIErrorBody(status: number, message: string, code?: string) {
  return {
    error: {
      message,
      type: status >= 500 ? "upstream_error" : "invalid_request_error",
      code: code ?? `http_${status}`,
    },
  };
}

export class RateLimitError extends ApiError {
  constructor(message = "Rate limit exceeded") {
    super(429, "rate_limit_exceeded", message);
  }
}

export class QuotaError extends ApiError {
  constructor(message = "Monthly quota exceeded") {
    // Chuẩn OpenAI: vượt quota → 429 insufficient_quota
    super(429, "insufficient_quota", message);
  }
}
