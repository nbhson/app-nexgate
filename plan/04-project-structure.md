# 04 — Cấu trúc dự án (Project Structure)

> Cấu trúc thư mục code khuyến nghị, quy ước đặt tên, và việc bố trí module. Monorepo đơn giản (app + dashboard) trong một repo.

## 1. Cấu trúc thư mục (target)

```
app-nexGate/
├── README.md
├── plan/                          # tài liệu (repo này)
├── package.json                   # workspace root
├── tsconfig.json
├── .env.example
├── .gitignore
├── docker-compose.yml             # (tùy chọn)
├── src/
│   ├── index.ts                   # entrypoint server chính
│   ├── app.ts                     # khởi tạo Hono app, mount routes
│   ├── config/
│   │   ├── env.ts                 # đọc & validate env (zod)
│   │   └── constants.ts
│   ├── db/
│   │   ├── client.ts              # better-sqlite3 instance
│   │   ├── schema.ts              # Drizzle schema (xem 06-database-schema.md)
│   │   ├── migrations/            # Drizzle-kit migrations
│   │   └── seed.ts                # seed admin/upstream mặc định
│   ├── routes/
│   │   ├── v1/
│   │   │   ├── models.ts          # GET /v1/models
│   │   │   ├── chat.ts            # POST /v1/chat/completions
│   │   │   ├── embeddings.ts      # POST /v1/embeddings
│   │   │   └── responses.ts       # POST /v1/responses (optional)
│   │   └── admin/
│   │       ├── auth.ts            # login/logout admin
│   │       ├── providers.ts       # CRUD provider
│   │       ├── models.ts          # CRUD model catalog
│   │       ├── keys.ts            # CRUD client keys
│   │       └── usage.ts           # biểu đồ/log usage
│   ├── middleware/
│   │   ├── client-auth.ts         # verify client bearer key
│   │   ├── rate-limit.ts          # in-memory rate limiter
│   │   ├── admin-auth.ts          # admin session guard
│   │   ├── request-log.ts         # pino-http + usage hook
│   │   └── error-handler.ts       # chuẩn hoá lỗi
│   ├── services/
│   │   ├── proxy.ts               # core: build upstream request + stream passthrough
│   │   ├── auth.ts                # token issue/verify (client + admin)
│   │   ├── keys.ts                # sinh/rotate/revoke client keys
│   │   ├── usage.ts               # ghi/đọc usage logs
│   │   └── routing.ts             # resolve model → provider config
│   ├── providers/
│   │   └── openai-compatible.ts   # upstream client (fetch + SSE pipe)
│   ├── security/
│   │   ├── crypto.ts              # AES-GCM mã hoá upstream keys
│   │   └── hash.ts                # bcrypt
│   ├── lib/
│   │   ├── http.ts                # helpers HTTP (status, errors)
│   │   └── logger.ts              # pino instance
│   └── types/
│       └── openai.ts              # OpenAI-compatible types (Request/Response/SSE)
├── dashboard/                     # SPA build tĩnh (React + Vite + Tailwind)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                   # client gọi /admin/*
│       ├── pages/                 # Login, Overview, Providers, Models,
│       │                          # ApiKeys, Usage, Settings
│       ├── components/
│       └── hooks/
├── tests/
│   ├── unit/                      # vitest — services, crypto, routing
│   └── integration/               # supertest — /v1 proxy, admin CRUD
├── scripts/
│   └── (seed, tunnel helper, backup)
└── data/                          # (gitignored) nexgate.db, runtime
```

> Trong repo: `src/` và `dashboard/` đặt chung root với npm workspaces (`workspaces: ["dashboard"]`) hoặc tách 2 gói riêng — khuyến nghị **npm workspaces** để dễ chạy 1 lệnh khởi động cả 2.

## 2. Quy ước đặt tên

- **File route:** `kebab-case.ts`; handler export tên hàm mô tả hành động (`createProvider`, `listModels`).
- **DB columns:** `snake_case` (Drizzle tự map `camelCase` ↔ `snake_case` khi config).
- **Env vars:** `UPPER_SNAKE_CASE`, tiền tố theo module (`UPSTREAM_`, `ADMIN_`, `DB_`).
- **Client key format:** `sk-nex_<crc16-6char>_<nanoid(24)>` (prefix giúp tách loại key và debug nhanh).
- **Admin session:** cookie `nex_admin` (httpOnly, signed), TTL mặc định 12h.

## 3. Quy ước code & luồng dữ liệu

- Route → (middleware xác thực) → service (business logic) → repository (DB via Drizzle) → response.
- Không truy cập DB trực tiếp trong route; mọi thứ qua service layer (dễ test).
- Lỗi: một hàm `ApiError(status, code, message)`; error-handler render `{ error: { code, message } }` hoặc OpenAI-style nếu cần gửi upstream.
- Zod schema đặt cạnh route trong `routes/*/*.schema.ts` hoặc inline nếu ngắn.

## 4. Kiểm soát luồng proxy (điểm bảo trì quan trọng)

```
POST /v1/chat/completions
 1. client-auth: verify Bearer sk-nex-...
 2. validate body (zod) + max size
 3. rate-limit (per client key)
 4. routing: body.model → model catalog → provider + upstream_model_id
 5. build upstream URL: `${provider.baseUrl}/chat/completions`
    header: Authorization: Bearer ${decrypt(provider.apiKey)}
 6. fetch upstream (stream: body.stream)
    - stream === true  → pipe ReadableStream → SSE response
    - stream === false → await json → parse usage → respond
 7. ghi usage log (đọc từ response.usage, fallback estimate)
 8. AbortController: khi client disconnect → abort upstream fetch
```

## 5. Scripts (package.json root)

| Script | Lệnh | Mô tả |
|--------|------|-------|
| `dev` | `tsx watch src/index.ts` | chạy server (hot reload) |
| `dev:all` | đồng chạy `dev` + `dashboard dev` | full-stack dev |
| `build` | build server + dashboard | bản production |
| `start` | node dist server | production |
| `db:migrate` | `drizzle-kit migrate` | áp migration |
| `db:seed` | seed dữ liệu mặc định | tạo admin/upstream mẫu |
| `test` | `vitest run` | unit + integration |
| `lint` / `format` | eslint / prettier | chất lượng |
| `tunnel` | chạy cloudflared trỏ về local | tiện expo thử |

## 6. .gitignore (bắt buộc có)

```
node_modules/
dist/
data/
.env
*.local
.DS_Store
coverage/
```
