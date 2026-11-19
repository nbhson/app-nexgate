/** API client gọi backend (cùng origin khi serve chung; Vite proxy khi dev). */

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    credentials: "same-origin",
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message ?? body?.message ?? JSON.stringify(body);
    } catch {
      /* ignore */
    }
    const err = new Error(detail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return (await res.json()) as T;
}

export const api = {
  get<T>(path: string) {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
  },
  patch<T>(path: string, body?: unknown) {
    return request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
  },
  put<T>(path: string, body?: unknown) {
    return request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
  },
  del<T>(path: string) {
    return request<T>(path, { method: "DELETE" });
  },
};

// ── Types ──────────────────────────────────────────────────────────────────
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnc: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Model {
  id: number;
  exposedId: string;
  providerId: string;
  upstreamModelId: string;
  enabled: boolean;
  maxTokens: number | null;
  costInputPer1k: number | null;
  costOutputPer1k: number | null;
  createdAt: number;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  enabled: boolean;
  modelWhitelist: string; // JSON string[]
  providerWhitelist: string; // JSON string[]
  quotaTokens: number | null;
  quotaResetDay: number;
  rateLimitPerMin: number | null;
  createdAt: number;
  expiresAt: number | null;
  quotaUsed?: number;
  lastUsedAt?: number | null;
}

export interface UsageLog {
  id: number;
  apiKeyId: string;
  modelId: string;
  providerId: string;
  requestId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  statusCode: number;
  errorCode: string | null;
  streamed: boolean;
  createdAt: number;
}

export interface TimeSeriesPoint {
  ts: string;
  requests: number;
  totalTokens: number;
}

export interface TodayStats {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelUsageStats {
  modelId: string;
  providerId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
}

export interface SettingItem {
  key: string;
  kind: "int" | "bool";
  label: string;
  hint: string;
  default: number | boolean;
  value: number | boolean;
  overridden: boolean;
}

export interface AuditLogRecord {
  id: number;
  username: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  createdAt: number;
}

/** Parse whitelist JSON "[]" từ ApiKeyRecord. */
export function parseWhitelist(json: string | undefined | null): string[] {
  try {
    const arr = JSON.parse(json ?? "[]");
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
