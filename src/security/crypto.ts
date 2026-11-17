import { createHash } from "node:crypto";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { masterKey } from "../config/env.js";

const ALGO = "aes-256-gcm";

/** Mã hoá AES-256-GCM. Return: base64(iv || ciphertext || tag) */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

/** Giải mã AES-256-GCM. Return null nếu key sai hoặc data lỗi. */
export function decryptSecret(payload: string): string | null {
  try {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const data = buf.subarray(12, buf.length - 16);
    const decipher = createDecipheriv(ALGO, masterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Hash một chiều (SHA-256 hex) — dùng cho client API keys. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
