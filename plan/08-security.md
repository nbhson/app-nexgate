# 08 — Bảo mật (Security)

> Mục tiêu: giữ bí mật upstream an toàn, ngăn lạm dụng key, bảo vệ gateway khỏi bị dùng chùa / tấn công. Phù hợp bối cảnh máy nhà hở 1 port/tunnel.

## 1. Nguyên tắc

- **Least privilege:** client key chỉ thấy model được whitelist; upstream key không bao giờ rời gateway.
- **Không lưu plaintext:** mọi bí mật (client key, upstream key) chỉ lưu dạng hash/mã hoá.
- **Phân tách mạnh:** auth của client (`/v1`) hoàn toàn tách khỏi auth admin (`/admin`).
- **Log sạch:** không ghi Authorization, body, key vào log.
- **Defense in depth:** tunnel + auth + rate limit + validation.

## 2. Xác thực

### 2.1 Client (/v1)
- Bearer token: `Authorization: Bearer sk-nex_...`
- Lưu DB: `key_hash = sha256(sk)`; lookup theo hash. So sánh constant-time.
- Expiry: `expires_at` optional; khi hết hạn → 401 `invalid_api_key`.
- Rotate: vô hiệu key cũ ngay lập tức, cấp key mới.

### 2.2 Admin (/admin)
- Basic form login → session cookie `nex_admin` (httpOnly, SameSite=Lax, Secure khi TLS, signed bằng `ADMIN_SESSION_SECRET`).
- TTL 12h; logout xoá cookie.
- Brute-force: sau 5 lần sai → lock 1 phút (in-memory counter per IP).

### 2.3 Minh bạch với user
- Key full chỉ hiển thị 1 lần lúc tạo; dashboard chỉ show prefix+last4.

## 3. Mã hoá bí mật

- **Upstream `api_key_enc`:** AES-256-GCM, master key từ `DB_MASTER_KEY` (32 bytes base64). Format lưu: `<iv 12B><ciphertext><tag 16B>` base64.
- **Key rotation master:** script re-encrypt toàn bộ providers; khuyến nghị đổi master định kỳ.
- **Env:** không commit `.env`; `.env.example` chỉ chứa placeholder.

## 4. Rate limiting & Quota

- Per client key: `rate_limit_per_min` (cửa sổ cố định, in-memory map trong 1 process — MVP OK). Vượt → 429.
- Quota tháng theo token: cộng dồn từ `usage_logs` từ đầu chu kỳ tháng (theo `quota_reset_day`). Vượt → 429 `insufficient_quota`.
- (Option) giới hạn global instance để bảo vệ upstream default.

## 5. Phòng chống lạm dụng & tấn công

- **Max body size:** `MAX_BODY_SIZE_MB=32` → 413.
- **Header sanitisation:** không forward `Authorization` của client lên upstream; luôn build header mới với upstream key.
- **SSRF guard:** `baseUrl` của provider được validate (https/http, không phải localhost/private/169.254), chặn DNS rebinding cơ bản. Admin là người duy nhất nhập baseUrl → rủi ro thấp nhưng vẫn kiểm tra.
- **TLS:** bắt buộc HTTPS phía ngoài (Cloudflare tunnel cấp sẵn; nếu tự expose → dùng reverse proxy TLS). Không đưa giao diện admin ra mạng công khai nếu có thể (bind 127.0.0.1 + tunnel riêng, hoặc chặn `/admin` bằng IP allowlist qua WAF/tunnel access).
- **Timeouts:** upstream connect/read timeout (vd 10s/120s) → 504; abort khi client ngắt để không tốn upstream.
- **DoS mức nhẹ:** concurrency limit per key (vd 5 concurrent) — phòng 1 request nặng chiếm upstream.
- **Log injection:** escape/loại control chars trong log (pino xử lý).
- **Backup:** DB backup được mã hoá nếu đi ngoài máy (tuỳ chọn).

## 6. Hạ tầng Web (headers)

- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP cho dashboard SPA.
- `helmet`-style middleware hoặc tự set (Hono).

## 7. Checklist phát hành

- [ ] `.env` không commit; `.gitignore` đúng.
- [ ] Upstream key lưu mã hoá; client key lưu hash.
- [ ] `/admin` không lộ ra public (trừ khi có cơ chế chặn IP).
- [ ] HTTPS hoạt động; cookie flags đúng.
- [ ] Rate limit + quota + concurrency bật.
- [ ] Log không chứa bí mật (kiểm tra giả lập request có key).
- [ ] Test rotate/revoke key khiến request cũ fail ngay.
- [ ] Test upstream down → lỗi sạch (502/504), không rò stack.
