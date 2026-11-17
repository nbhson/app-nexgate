import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, sha256Hex } from "../../src/security/crypto.js";
import { generateClientKey, clientKeyPrefix } from "../../src/security/hash.js";
import { checkLimits } from "../../src/services/rate-limit.js";

describe("crypto", () => {
  it("encrypt + decrypt round-trip", () => {
    const plain = "sk-test-secret-123";
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(enc).toBeTruthy();
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("decrypt data hỏng → null", () => {
    const enc = encryptSecret("secret");
    // Cắt bớt để hỏng cấu trúc (iv + ciphertext + tag)
    expect(decryptSecret(enc.slice(0, 20))).toBeNull();
    expect(decryptSecret("không-phải-base64-đúng")).toBeNull();
  });

  it("sha256Hex is deterministic", () => {
    const h1 = sha256Hex("abc");
    const h2 = sha256Hex("abc");
    const h3 = sha256Hex("def");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toHaveLength(64);
  });
});

describe("hash helpers", () => {
  it("generateClientKey format đúng", () => {
    const key = generateClientKey();
    expect(key).toMatch(/^sk-nex_[a-z0-9]+_[a-z0-9-]+$/);
  });

  it("clientKeyPrefix extract đúng", () => {
    const key = "sk-nex_abc123_xyz";
    expect(clientKeyPrefix(key)).toBe("sk-nex_abc123");
  });
});

describe("rate limiter", () => {
  it("checkLimits mặc định cho key không có limit → OK", () => {
    const mockKey = { id: "test", rateLimitPerMin: null, quotaTokens: null } as Parameters<typeof checkLimits>[0];
    const result = checkLimits(mockKey);
    expect(result.ok).toBe(true);
  });
});
