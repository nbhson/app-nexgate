import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";
import { sha256Hex } from "./crypto.js";

const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const nanoid6 = customAlphabet(KEY_ALPHABET, 6);
const nanoid24 = customAlphabet(KEY_ALPHABET, 24);

/** Hash mật khẩu admin (bcrypt, cost 12). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** So sánh mật khẩu admin vs hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Tạo client API key ngẫu nhiên. Format: sk-nex_{6chars}_{24chars} — charset [a-z0-9] */
export function generateClientKey(): string {
  return `sk-nex_${nanoid6()}_${nanoid24()}`;
}

/** Extract prefix hiển thị từ key: "sk-nex_abcd12" */
export function clientKeyPrefix(key: string): string {
  const parts = key.split("_");
  return parts.length >= 2 ? `sk-nex_${parts[1]}` : key.slice(0, 12);
}
