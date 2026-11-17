import { env } from "../config/env.js";
import type { ApiKey } from "../db/schema.js";
import { getMonthlyUsage } from "./keys.js";

interface Bucket {
  count: number;
  resetAt: number;
}

/** In-memory rate limiter: cửa sổ cố định (per process). MVP đủ. */
class RateLimiter {
  private buckets = new Map<string, Bucket>();

  private key(bucketId: string): string {
    const now = Date.now();
    return `${bucketId}:${Math.floor(now / 60_000)}`;
  }

  check(bucketId: string, limitPerMin: number): { allowed: boolean; remaining: number; retryAfterSec: number } {
    if (limitPerMin <= 0) return { allowed: true, remaining: 0, retryAfterSec: 0 };
    const k = this.key(bucketId);
    const bucket = this.buckets.get(k);
    if (!bucket) {
      this.buckets.set(k, { count: 1, resetAt: Date.now() + 60_000 });
      return { allowed: true, remaining: limitPerMin - 1, retryAfterSec: 0 };
    }
    if (bucket.count >= limitPerMin) {
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000)) };
    }
    bucket.count += 1;
    return { allowed: true, remaining: limitPerMin - bucket.count, retryAfterSec: 0 };
  }

  /** Dọn bucket cũ (chạy định kỳ). */
  cleanup(maxAgeMs = 10 * 60_000): void {
    const now = Date.now();
    for (const [k, b] of this.buckets) {
      if (now - b.resetAt > maxAgeMs) this.buckets.delete(k);
    }
  }
}

export const rateLimiter = new RateLimiter();

/** Chạy cleanup mỗi 5 phút. */
setInterval(() => rateLimiter.cleanup(), 5 * 60_000).unref();

export function defaultRateLimit(): number {
  return env.RATE_LIMIT_DEFAULT;
}

export interface LimitCheck {
  ok: boolean;
  reason?: "rate" | "quota" | "concurrency";
  retryAfterSec?: number;
  message?: string;
}

/**
 * Kiểm tra toàn bộ limit của 1 client key (rate + quota).
 * Concurrency track riêng trong middleware proxy.
 */
export function checkLimits(apiKey: ApiKey): LimitCheck {
  const limit = apiKey.rateLimitPerMin ?? defaultRateLimit();
  const r = rateLimiter.check(apiKey.id, limit);
  if (!r.allowed) {
    return { ok: false, reason: "rate", retryAfterSec: r.retryAfterSec, message: "Rate limit exceeded" };
  }

  if (apiKey.quotaTokens != null && apiKey.quotaTokens > 0) {
    const used = getMonthlyUsage(apiKey.id, apiKey.quotaResetDay);
    if (used >= apiKey.quotaTokens) {
      return { ok: false, reason: "quota", message: "Monthly quota exceeded" };
    }
  }

  return { ok: true };
}
