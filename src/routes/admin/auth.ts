import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyPassword } from "../../security/hash.js";
import { getAdminByUsername } from "../../db/seed.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../../config/constants.js";
import { adminSessionSecret } from "../../config/env.js";
import { recordAudit } from "../../services/audit.js";

export const adminAuth = new Hono<{ Variables: { adminUser: string } }>();

function signSessionToken(username: string): string {
  const payload = `${username}:${Date.now()}`;
  const sig = createHmac("sha256", adminSessionSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifySessionToken(token: string): string | null {
  if (!token || token.length < 10) return null;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon <= 0) return null;
    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expected = createHmac("sha256", adminSessionSecret()).update(payload).digest();
    const sigBuf = Buffer.from(sig, "hex");
    if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) return null;
    const colonIdx = payload.indexOf(":");
    if (colonIdx <= 0) return null;
    const username = payload.slice(0, colonIdx);
    const ts = parseInt(payload.slice(colonIdx + 1), 10);
    if (isNaN(ts)) return null;
    if (Date.now() - ts > SESSION_TTL_MS) return null;
    return username;
  } catch {
    return null;
  }
}

export function requireAdmin(c: Context<{ Variables: { adminUser: string } }>): boolean {
  const token = getCookie(c, SESSION_COOKIE) ?? "";
  const username = verifySessionToken(token);
  if (!username) return false;
  c.set("adminUser", username);
  return true;
}

adminAuth.post("/login", async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();
  if (!username || !password) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "username và password bắt buộc" } }, 400);
  }

  const admin = await getAdminByUsername(username);
  if (!admin) {
    return c.json({ error: { code: "INVALID_CREDENTIALS", message: "Tên đăng nhập hoặc mật khẩu không đúng" } }, 401);
  }

  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    return c.json({ error: { code: "INVALID_CREDENTIALS", message: "Tên đăng nhập hoặc mật khẩu không đúng" } }, 401);
  }

  const token = signSessionToken(username);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });

  recordAudit(username, "auth.login", undefined, c.req.header("x-forwarded-for")?.split(",")[0]?.trim());
  return c.json({ ok: true, username });
});

adminAuth.post("/logout", (c) => {
  recordAudit(requireAdmin(c) ? c.get("adminUser") : undefined, "auth.logout");
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

adminAuth.get("/me", (c) => {
  if (!requireAdmin(c)) {
    return c.json({ username: null });
  }
  return c.json({ username: c.get("adminUser") });
});
