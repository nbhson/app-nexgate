# 05 — API Contracts

> Định nghĩa toàn bộ API: (A) OpenAI-compatible proxy mà client dùng, (B) Admin API cho Dashboard. Mọi request/response đều JSON; lỗi theo chuẩn OpenAI `{ "error": { "message", "type", "code" } }`.

## A. OpenAI-compatible Proxy (`/v1/*`)

Đây là API mà **máy công ty / coding agent** gọi. Phải bám sát chuẩn OpenAI đề mọi agent (OpenCode, Cursor, Claude Code, ...) hoạt động không cần chỉnh gì thêm.

### A.1 `GET /v1/models` — danh sách model

**Auth:** `Authorization: Bearer <client_key>`

**Response 200:**
```json
{
  "object": "list",
  "data": [
    { "id": "gpt-4o", "object": "model", "created": 1700000000, "owned_by": "nexgate" }
  ]
}
```
> Trả về các model **expose** trong catalog (không lộ upstream model id nếu không map).

### A.2 `POST /v1/chat/completions` — chat (chính)

**Auth:** `Authorization: Bearer <client_key>`

**Request** (subset chuẩn OpenAI — full schema tương thích):
```json
{
  "model": "gpt-4o",
  "messages": [{ "role": "user", "content": "hello" }],
  "max_tokens": 256,
  "temperature": 0.7,
  "stream": true,
  "tools": []
}
```

**Behavior:**
- `stream: false` → trả JSON OpenAI-compatible, `usage` từ upstream được ghi log.
- `stream: true` → trả `text/event-stream` (SSE), pipe nguyên `data:` chunks từ upstream, không buffer.
- Ngắt kết nối client → `AbortController` hủy fetch upstream.

**Errors** (trả nguyên từ upstream nếu có, hoặc chuẩn hoá):
```json
{ "error": { "message": "...", "type": "invalid_request_error", "code": "invalid_model" } }
```
- `401` key không hợp lệ / hết hạn.
- `429` vượt rate limit / quota.
- `404` model không tồn tại trong catalog.
- `422` body không hợp lệ (zod).

### A.3 `POST /v1/embeddings`

Giống chat: `model` + `input` → proxy sang upstream. Response chuẩn OpenAI embedding list.

### A.4 `POST /v1/responses` *(optional, v1.0)*
Khi agent cần Responses API mới (một số tool quản lý statuses). Map về chat completions phía upstream nếu provider chưa hỗ trợ.

> Ghi chú: proxy **chuyển tiếp** params không biết tới upstream (forward passthrough) — hỗ trợ federation đơn giản, không chặn feature mới của upstream.

## B. Admin API (`/admin/*`)

Chỉ Dashboard gọi; xác thực bằng **admin session cookie** (hoặc `X-Admin-Key`). Mọi route trả JSON.

### B.0 `POST /admin/auth/login` — đăng nhập
```json
{ "username": "admin", "password": "..." }
```
→ `200 { "ok": true }` + set signed cookie `nex_admin` (httpOnly). `POST /admin/auth/logout` xoá cookie.

### B.1 Providers
| Method | Route | Body | Desc |
|--------|-------|------|------|
| GET | `/admin/providers` | — | list providers (mask apiKey: `sk-****abcd`) |
| POST | `/admin/providers` | `{ name, baseUrl, apiKey, enabled }` | tạo provider (apiKey mã hoá lưu DB) |
| PATCH | `/admin/providers/:id` | partial fields | cập nhật (apiKey mới → replace) |
| DELETE | `/admin/providers/:id` | — | xoá (chặn nếu đang có model trỏ tới) |
| POST | `/admin/providers/:id/test` | — | test kết nối (`GET /v1/models` qua upstream key) |

### B.2 Models (catalog)
| Method | Route | Body | Desc |
|--------|-------|------|------|
| GET | `/admin/models` | — | list models + provider map |
| POST | `/admin/models` | `{ id, providerId, upstreamModelId?, ownedBy='nexgate' }` | thêm model expose |
| PATCH | `/admin/models/:id` | partial | sửa (đổi provider) |
| DELETE | `/admin/models/:id` | — | xoá khỏi catalog |

### B.3 Client API Keys
| Method | Route | Body | Desc |
|--------|-------|------|------|
| GET | `/admin/keys` | — | list keys (chỉ show prefix + last4) |
| POST | `/admin/keys` | `{ name, modelWhitelist?: [], quotaPerMonth?: num, rateLimitPerMin?: num, enabled }` | tạo key mới |
| POST | `/admin/keys` (response) | — | trả `apiKey` **đầy đủ một lần duy nhất** |
| PATCH | `/admin/keys/:id` | partial | rotate (ra key mới), enable/disable, đổi limits |
| DELETE | `/admin/keys/:id` | — | thu hồi |

### B.4 Usage & Logs
| Method | Route | Desc |
|--------|-------|------|
| GET | `/admin/usage/summary?from&to` | tổng requests/tokens theo ngày, theo key, theo model |
| GET | `/admin/usage/timeseries?from&to&granularity=day|hour` | dữ liệu biểu đồ |
| GET | `/admin/keys/:id/usage?from&to` | usage riêng cho 1 key |
| GET | `/admin/logs?cursor&limit&modelId&keyId&status` | stream log chi tiết (pagination cursor-based) |

### B.5 Settings / Instance
| Method | Route | Desc |
|--------|-------|------|
| GET | `/admin/settings` | cấu hình instance (rate default, max body, tunnel URL...) |
| PATCH | `/admin/settings` | cập nhật |
| GET | `/healthz` | **không auth** — `{ status: "ok", version, db: "up" }` |

## C. Error envelope chung (Admin)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "apiKey is required", "details": {...} } }
```

## D. SSE contract chi tiết (chat streaming)

- Header: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- Data lines format đúng OpenAI: `data: {...}\n\n`, kết thúc `data: [DONE]\n\n`.
- Heartbeat: `: ping\n\n` mỗi 15s nếu idle (tránh timeout NAT/proxy trung gian).

## E. Chuẩn hoá mã lỗi

| Code | HTTP | Ý nghĩa |
|------|------|---------|
| `invalid_api_key` | 401 | client key sai/hết hạn |
| `insufficient_quota` | 429 | vượt quota tháng |
| `rate_limit_exceeded` | 429 | vượt rate/min |
| `model_not_found` | 404 | model không trong catalog/whitelist |
| `upstream_unavailable` | 502 | provider gốc lỗi/offline |
| `upstream_timeout` | 504 | upstream quá thời gian chờ |
| `validation_error` | 422 | body sai schema |

> Proxy trả **nguyên `message` từ upstream** nếu upstream trả lỗi HTTP (giữ fidelity; một số agent cần đọc message chuẩn của provider).
