# 03 — Tech Stack

> Lựa chọn công nghệ cho từng thành phần, kèm lý do. Nguyên tắc: **đơn giản, dễ maintain bởi 1-2 người, đủ nhanh cho streaming.**

## 1. Tổng quan lựa chọn

| Thành phần | Công nghệ | Phiên bản | Ghi chú |
|-----------|-----------|-----------|---------|
| Runtime | Node.js | 20+ (LTS) | streaming SSE, sinh thái AI lớn |
| Ngôn ngữ | TypeScript | 5.x | type-safe toàn codebase |
| HTTP framework | Hono | 3.x | nhẹ, nhanh, hỗ trợ streaming tốt, JSX cho UI tùy chọn |
| Runtime runtime thay thế | Bun (optional) | — | tăng tốc nếu muốn, giữ code tương thích |
| ORM / Query | Drizzle ORM | 0.3x | type-safe, schema-first, migration dễ |
| Database | SQLite (better-sqlite3) | 3.x | zero-ops, single file |
| Streaming | Native `fetch` + `ReadableStream` | — | passthrough không buffer |
| Xác thực session admin | signed cookie + admin key | — | không cần framework auth nặng |
| Password hash | bcrypt (argon2 optional) | — | cho admin login |
| Mã hóa upstream key | `crypto` AES-256-GCM | — | master key từ env |
| UI Dashboard | React + Vite + Tailwind | React 18/19, Vite 5, TW 3/4 | SPA nhẹ, build tĩnh |
| Chart | Recharts | 2.x | biểu đồ usage |
| Test | Vitest + supertest | — | unit + integration |
| Lint/Format | ESLint + Prettier + TypeScript strict | — | chất lượng code |
| Docker | (tùy chọn) docker-compose | — | chuẩn hóa môi trường |
| Tunnel | cloudflared / tailscale | — | CLI ngoài, không trong app |

## 2. Lý do chọn (rationale)

### 2.1 Node.js + TypeScript + Hono
- **Streaming:** Node `fetch`/`stream` xử lý SSE ra vào tốt; Hono cho phép pipe `ReadableStream` trực tiếp → passthrough latency thấp, chí phí RAM thấp (không buffer đầy body).
- **Ecosystem:** mọi coding agent (OpenCode, Cursor, Claude Code...) đều là JS — dễ đối chiếu chuẩn API.
- **Lightweight:** Hono chạy trên Web Standard, thân thiện với edge/micro runtime nếu sau này muốn deploy VPS nhỏ.
- Lý do không chọn: Python/FastAPI (ok nhưng streaming/event loop phức tạp hơn), Go (tốt nhưng tốc độ phát triển dashboard/admin chậm hơn so với TS cùng bộ tool).

### 2.2 SQLite + Drizzle
- **SQLite:** một file, backup copy-paste, không cần server DB riêng — đúng bối cảnh "máy nhà một instance". Đủ cho hàng trăm nghìn request/tháng.
- **Drizzle:** schema map type TS → DB, migration có kiểm tra, nhẹ hơn Prisma (không có engine riêng phức tạp trên máy người dùng).
- Nâng cấp đường (v2): cùng schema Drizzle có thể trỏ Postgres nếu cần.

### 2.3 React + Vite + Tailwind
- Dashboard là SPA tĩnh, serve thẳng từ cùng server (hoặc CDN). Build nhanh với Vite.
- Tailwind giúp giao diện gọn, dễ thay đổi theme, không cần design system nặng.

## 3. Kiến trúc module (layered)

```
┌─────────────────────────────────────┐
│        Presentation (Dashboard SPA) │  React SPA → /admin
├─────────────────────────────────────┤
│              HTTP Layer             │  Hono routes
│   /v1/* (proxy)    /admin/*         │
├─────────────────────────────────────┤
│             Application             │  services: auth, keys, usage,
│       (use cases & orchestration)   │  routing, provider client
├─────────────────────────────────────┤
│            Infrastructure           │  repositories (Drizzle), crypto,
│      (DB access, upstream client)   │  upstream fetcher, rate limiter
└─────────────────────────────────────┘
```

## 4. Thư viện hỗ trợ (danh sách chính)

| Package | Mục đích |
|---------|----------|
| `hono` | HTTP server |
| `@hono/node-server` | run Hono trên Node |
| `hono/basic-auth` | basic auth admin (hoặc tự viết) |
| `drizzle-orm`, `better-sqlite3`, `drizzle-kit` | DB + migration |
| `zod` | validate request body/contract |
| `bcryptjs` | hash & so sánh mật khẩu admin |
| `nanoid` | sinh CDN key/ids | 
| `pino` + `pino-http` | logging có cấu trúc |
| `dotenv` | env loading |
| `react`, `react-dom`, `react-router-dom` | Dashboard |
| `vite`, `@vitejs/plugin-react`, `tailwindcss` | build UI |
| `recharts` | biểu đồ usage |
| `vitest`, `supertest` | test |
| `typescript`, `eslint`, `prettier` | DX |

## 5. Quy ước chất lượng

- TypeScript `strict: true`, `noUncheckedIndexedAccess`.
- Mọi route đều có zod schema; lỗi validate → 400 với mã lỗi chuẩn.
- Không `any`; upstream model pay load dùng interface mở (OpenAI-compatible schema).
- Streaming code: ưu tiên pipe, dùng `AbortController` để hủy upstream khi client ngắt.
- Bí mật không bao giờ vào code/log (redact header Authorization, key).

## 6. Không dùng (MVP) — tránh tiêu tốn

- KHÔNG Kafka/message queue, KHÔNG Redis (rate limit dùng in-memory + DB), KHÔNG Docker Compose bắt buộc, KHÔNG Kubernetes, KHÔNG OpenTelemetry collector đầy đủ (chỉ log + DB usage), KHÔNG Postgres (chuyển khi cần).
- Rate limiter in-memory (cửa sổ cố định) đủ cho MVP; nâng cấp lên Redis khi multi-instance (v2).
