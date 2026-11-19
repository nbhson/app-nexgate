export const APP_NAME = "NexGate";
export const APP_VERSION = "1.1.0";

export const MAX_BODY_BYTES = parseInt(process.env.MAX_BODY_SIZE_MB ?? "32", 10) * 1024 * 1024;

export const DEFAULT_QUOTA_RESET_DAY = 1;

/** Key prefix dùng cho client keys */
export const CLIENT_KEY_PREFIX = "sk-nex_";

export const SESSION_COOKIE = "nex_admin";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

export const SSE_HEARTBEAT_MS = 15_000;
