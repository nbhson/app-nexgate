# 01 — Kiến trúc NexGate

> Mục tiêu: trả lời câu hỏi cốt lõi — "từ máy công ty kết nối tới máy nhà thế nào? Config phía client đủ chưa?" và định nghĩa kiến trúc tổng thể cho MVP.

## 1. Vai trò & ranh giới

NexGate là một **OpenAI-compatible gateway** chạy trên máy chủ (máy nhà). Nó:

- **Nhận** request theo chuẩn OpenAI (`/v1/*`) từ các client (máy công ty, máy khác).
- **Xác thực & kiểm soát** client (apt key riêng, rate limit, quota, whitelist model).
- **Chuyển tiếp** (proxy) request tới **upstream/external provider** thật (vd: `https://xxx.com/v1`) — nơi chỉ máy nhà truy cập được.
- **Trả về** nguyên vẹn response (bao gồm cả streaming SSE) cho client.

Gateway **không** sinh model. Đây là điểm khác với "AI gateway" kiểu xử lý/nén/lọc nội dung — ở đây chỉ là **reverse proxy thông minh + lớp quản lý** phía trên provider gốc.

## 2. Sơ đồ luồng request (end-to-end)

```
[Client — máy công ty]
   coding agent (OpenCode / Cursor / Claude Code / ...)
        │  baseurl = http://<gateway>/v1
        │  apikey  = sk-nex-... (client key do Dashboard cấp)
        │  model   = <model id được khai báo>
        ▼
┌─────────────────────────────────────────────┐
│            NEXGATE GATEWAY (máy nhà)        │
│                                             │
│  HTTP Server (OpenAI-compatible)            │
│   ├─ /v1/models                             │
│   ├─ /v1/chat/completions                   │
│   ├─ /v1/embeddings                         │
│   └─ /v1/responses (optional)               │
│                                             │
│  Middleware chain:                          │
│   1. API key auth (client)                  │
│   2. Rate limit / quota check               │
│   3. Model whitelist & routing (chọn upstream)│
│   4. Logging + usage recording              │
│                                             │
│  Upstream client:                           │
│   - dùng upstream apikey + upstream baseurl │
│   - streaming passthrough (SSE, no-buffer)  │
└──────────────┬──────────────────────────────┘
               │  HTTP (giữ kết nối upstream real)
               ▼
   [External Provider — xxx.com/v1]
```

## 3. Trả lời câu hỏi cốt lõi

**"Config từ máy công ty hay chỉ cần config từ gateway?"**

→ **Cần config ở CẢ HAI nơi, nhưng mỗi nơi một lớp key, không trùng nhau:**

| Lớp | Nơi cấu hình | Giá trị |
|-----|--------------|---------|
| **Upstream** (kết nối ra provider thật) | Gateway — biến môi trường / Dashboard | `UPSTREAM_BASE_URL=https://xxx.com/v1`, `UPSTREAM_API_KEY=sk-upstream-...`, danh sách model |
| **Client** (máy công ty kết nối vào gateway) | Máy công ty — bất kỳ coding agent nào | `baseurl=http://<gateway>/v1`, `apikey=sk-nex-<client_key>`, `model=<model id>` |

Điểm mấu chốt:

- Máy công ty **KHÔNG cần biết** apikey/provider gốc. Nó chỉ cần key do NexGate cấp.
- Máy công ty **KHÔNG cần config** gì thêm về upstream — mọi thứ phía upstream nằm gọn trong gateway.
- Gateway nên **không relay** apikey gốc của client; client chỉ cần hướng `baseurl` tới máy nhà và có một key hợp lệ → đúng như thiết lập "custom provider" thông thường mà mọi coding agent đều hỗ trợ.
- Node/port/phơi gateway ra ngoài (tunnel hay IP công khai) là việc của hạ tầng → xem `02-infrastructure.md`.

**Kết luận kiến trúc đề xuất ban đầu là đúng.** Phần cần bổ sung: (a) bảng `api_keys` hai loại (upstream key vs client key), (b) cơ chế routing model → provider, (c) lớp truy cập máy nhà từ bên ngoài (tunnel).

## 4. Các khối thành phần (components)

### 4.1 Proxy Core
- HTTP server tương thích OpenAI (`/v1/chat/completions`, `/v1/models`, ...).
- Streaming passthrough: nhận request, stream nguyên từ upstream, không buffer toàn bộ body (quan trọng cho chat với token dài).
- Hỗ trợ: JSON body, SSE (`text/event-stream`), `stream: true`, `AbortController` khi client ngắt.
- Forward header cần thiết (Authorization được **thay thế** bằng upstream key, không chuyển tiếp key client lên upstream — tránh rò rỉ).

### 4.2 Tenant & Key Management
- Client key: `sk-nex-...` cấp cho từng máy người dùng (có thể disable/rotate).
- Mỗi key gắn: giới hạn model (whitelist), rate limit, quota (tùy chọn cho MVP).
- Upstream key: lưu **mã hóa** trong DB hoặc biến môi trường.

### 4.3 Model Catalog & Routing
- Bảng `models`: id expose (`gpt-4o`, `claude-sonnet-...`), ánh xạ tới `provider` + `upstream_model_id`.
- Có thể dùng một key quyết định router: `map-model-match` hoặc default fallback.
- `/v1/models` trả về danh sách model expose (không lộ model upstream nếu không cần).

### 4.4 Usage & Observability
- Ghi log mỗi request: key, model, input/output token, latency, status, time.
- (MVP) đếm bằng metadata trả về từ provider; (sau) tính token phía gateway khi cần chính xác.
- Dashboard đọc từ DB để vẽ biểu đồ usage.

### 4.5 Admin Service (Dashboard + Admin API)
- REST `/admin/*` (xem `05-api-contracts.md`).
- Auth: admin key / basic login riêng, tách hẳn với client key.
- Quản lý: provider, model, api_keys, xem usage, log.

## 5. Quyết định thiết kế (ADR tóm tắt)

| Quyết định | Lựa chọn | Lý do |
|-----------|----------|-------|
| Streaming model | Passthrough không buffer | Giảm latency cảm nhận, chi phí RAM, đúng hành vi client |
| Lưu upstream key | Mã hóa (AES-GCM, master key từ env) | Tránh lộ khi DB bị đọc |
| Routing | Map model → provider trên gateway | Đơn giản, minh bạch, không cần semantic router cho MVP |
| Client auth | Bearer token đơn giản | Tương thích mọi coding agent, không phức tạp hóa |
| DB cho MVP | SQLite | Single-machine, zero-ops; đủ cho hàng trăm nghìn request |
| Phơi gateway ra ngoài | Tunnel (Cloudflare/Tailscale/frp) — xem `02-infrastructure.md` | Không cần IP tĩnh, an toàn hơn mở port thô |

## 6. Phiên bản kiến trúc

- **MVP (hiện tại):** 1 instance trên 1 máy, SQLite, no queue, no HA. Phục vụ mục đích "máy nhà làm gateway cho vài máy cá nhân".
- **v1.0:** thêm multi-provider chính thức, rotate key, quota, cache, log chi tiết.
- **v2.0 (tương lai):** multi-instance + HA, hàng đợi, load balancer upstream, plugin middleware.

Xem `09-roadmap.md` để biết lộ trình đầy đủ.
