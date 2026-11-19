import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { env } from "../config/env.js";

/**
 * Runtime settings: key-value trong DB, override giá trị env mặc định.
 * Chỉ những key trong DEFINITIONS mới được đọc/ghi — chống tự do nhét config lạ.
 */
type SettingDef =
  | { kind: "int"; default: () => number; min?: number; max?: number; label: string; hint: string }
  | { kind: "bool"; default: () => boolean; label: string; hint: string };

export const DEFINITIONS = {
  rateLimitDefault: {
    kind: "int", default: () => env.RATE_LIMIT_DEFAULT, min: 0, max: 100_000,
    label: "Rate limit mặc định (req/phút)",
    hint: "Áp dụng cho key không đặt rate limit riêng. 0 = không giới hạn.",
  },
  quotaDefaultTokens: {
    kind: "int", default: () => 0, min: 0, max: 1_000_000_000,
    label: "Quota tháng mặc định (token)",
    hint: "0 = không giới hạn. Áp dụng khi tạo key không nhập quota.",
  },
  upstreamTimeoutMs: {
    kind: "int", default: () => env.UPSTREAM_READ_TIMEOUT_MS, min: 1_000, max: 600_000,
    label: "Upstream timeout (ms)",
    hint: "Thời gian tối đa chờ upstream phản hồi cho 1 request.",
  },
  maxBodyMb: {
    kind: "int", default: () => env.MAX_BODY_SIZE_MB, min: 1, max: 256,
    label: "Body tối đa (MB)",
    hint: "Giới hạn kích thước request body gửi vào gateway.",
  },
  streamIncludeUsage: {
    kind: "bool", default: () => true,
    label: "Xin usage từ stream (stream_options)",
    hint: "Gửi stream_options.include_usage=true khi stream. Tắt nếu upstream lạ không nhận field này (usage sẽ được ước lượng).",
  },
} satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof DEFINITIONS;

const KEY_SET = new Set<string>(Object.keys(DEFINITIONS));

function readRaw(key: SettingKey): string | null {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function getSettingNumber(key: SettingKey): number {
  const def = DEFINITIONS[key];
  if (def.kind !== "int") throw new Error(`Setting ${key} không phải số`);
  const raw = readRaw(key);
  if (raw == null) return def.default();
  const n = parseInt(raw, 10);
  return isNaN(n) ? def.default() : n;
}

export function getSettingBool(key: SettingKey): boolean {
  const def = DEFINITIONS[key];
  if (def.kind !== "bool") throw new Error(`Setting ${key} không phải boolean`);
  const raw = readRaw(key);
  if (raw == null) return def.default();
  return raw === "true" || raw === "1";
}

export function getSetting(key: SettingKey): number | boolean {
  return DEFINITIONS[key].kind === "bool" ? getSettingBool(key) : getSettingNumber(key);
}

/** Toàn bộ settings đã resolve + flag overridden (cho UI). */
export function getAllSettings() {
  return (Object.keys(DEFINITIONS) as SettingKey[]).map((key) => {
    const def = DEFINITIONS[key];
    const raw = readRaw(key);
    const effective = getSetting(key);
    return {
      key,
      kind: def.kind,
      label: def.label,
      hint: def.hint,
      default: def.kind === "int" ? def.default() : def.default(),
      value: effective,
      overridden: raw != null,
    };
  });
}

export interface SettingsUpdate {
  [k: string]: number | boolean;
}

/** Validate + ghi từng key. Trả về danh sách key đã ghi. */
export function updateSettings(patch: SettingsUpdate): { ok: string[]; errors: string[] } {
  const ok: string[] = [];
  const errors: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!KEY_SET.has(key)) {
      errors.push(`Setting '${key}' không tồn tại`);
      continue;
    }
    const def = DEFINITIONS[key as SettingKey];
    if (def.kind === "int") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < (def.min ?? 0) || n > (def.max ?? Infinity)) {
        errors.push(`Setting '${key}' phải là số nguyên trong [${def.min ?? 0}, ${def.max ?? "∞"}]`);
        continue;
      }
      db.insert(settings)
        .values({ key, value: String(n), updatedAt: Date.now() })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(n), updatedAt: Date.now() } })
        .run();
    } else {
      if (typeof value !== "boolean") {
        errors.push(`Setting '${key}' phải là boolean`);
        continue;
      }
      db.insert(settings)
        .values({ key, value: value ? "true" : "false", updatedAt: Date.now() })
        .onConflictDoUpdate({ target: settings.key, set: { value: value ? "true" : "false", updatedAt: Date.now() } })
        .run();
    }
    ok.push(key);
  }
  return { ok, errors };
}

// ── Getters tiện ích dùng ở runtime paths ────────────────────────────────────
export function defaultRateLimitRpm(): number {
  return getSettingNumber("rateLimitDefault");
}

export function defaultQuotaTokens(): number {
  return getSettingNumber("quotaDefaultTokens");
}

export function upstreamTimeoutMs(): number {
  return getSettingNumber("upstreamTimeoutMs");
}

export function maxBodyBytes(): number {
  return getSettingNumber("maxBodyMb") * 1024 * 1024;
}

export function streamIncludeUsage(): boolean {
  return getSettingBool("streamIncludeUsage");
}
