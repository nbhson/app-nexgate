# NexGate

**NexGate** — OpenAI-compatible API Gateway. Biến máy chủ (home machine) của bạn thành một gateway cho phép các máy khác (ví dụ máy công ty bị chặn truy cập provider) sử dụng chung tài nguyên AI model thông qua một API tương thích chuẩn OpenAI (`/v1`).

## Vấn đề nó giải quyết

- Provider gốc (`xxx.com/v1`) bị chặn ở một vài mạng (công ty, trường học,...).
- Máy nhà của bạn truy cập được provider gốc → máy nhà đóng vai trò **gateway**.
- Các máy khác chỉ cần cấu hình **custom provider** như bình thường (baseurl + apikey + model) trỏ về gateway của bạn là chạy được ngay trong mọi coding agent (Cursor, Claude Code, OpenCode, VS Code AI, ...).

## Kiến trúc tổng quan (1 lớp)

```
[Máy công ty / máy khác]
   │  config: baseurl=http://<gateway>/v1, apikey=<client_key>, model=<model>
   ▼
[NexGate Gateway — máy nhà]
   │  - nhận request OpenAI-compatible
   │  - xác thực client key / rate limit / quota
   │  - chọn upstream provider (routing)
   ▼
[External Provider — xxx.com/v1]
```

## Cài đặt nhanh (MVP)

> Chi tiết cài đặt đầy đủ xem `plan/02-infrastructure.md` và `plan/01-architecture.md`.

```bash
# 1. Cài đặt dependency
npm install

# 2. Cấu hình
cp .env.example .env
#   - sinh DB_MASTER_KEY:  openssl rand -base64 32
#   - sinh ADMIN_PASSWORD_HASH: node -e "console.log(require('bcryptjs').hashSync('pass',10))"
#   - điền UPSTREAM_BASE_URL / UPSTREAM_API_KEY (provider gốc)

# 3. Khởi tạo DB (schema + admin + provider mặc định)
npm run db:migrate
npm run db:seed

# 4. Chạy (dev: API + dashboard hot reload / production: build + start)
npm run dev
# hoặc
npm run build && npm start
```

Gateway lắng nghe tại `http://localhost:3000`, Dashboard tại `/` (đường dẫn cũ `/admin` sẽ tự chuyển về `/`; `/admin/*` là namespace của Admin API), API `/v1` tương thích OpenAI. Ngoài ra có thể quản lý provider/key/model trực tiếp qua Dashboard thay vì sửa `.env`.

## Config phía máy khách (client)

Trong coding agent bất kỳ, cấu hình **custom provider**:

```
Base URL  : http://<ip-may-nha>:3000/v1   (hoặc domain qua tunnel)
API Key   : <client_key được cấp trên Dashboard>
Model     : <model được khai báo trong gateway>
```

## Cấu trúc repository

```
app-nexGate/
├── README.md
├── plan/                     # ⇐ Toàn bộ tài liệu thiết kế & kế hoạch
│   ├── README.md             #   Mục lục các tài liệu
│   ├── 01-architecture.md    #   Kiến trúc
│   ├── 02-infrastructure.md  #   Hạ tầng & triển khai
│   ├── 03-tech-stack.md      #   Công nghệ
│   ├── 04-project-structure.md
│   ├── 05-api-contracts.md   #   API contracts
│   ├── 06-database-schema.md #   Schema DB
│   ├── 07-dashboard-design.md#   Thiết kế Dashboard
│   ├── 08-security.md        #   Bảo mật
│   ├── 09-roadmap.md         #   Roadmap phát triển
│   └── 10-deployment-guide.md#   TRIỂN KHAI từng bước (máy nhà + máy công ty)
├── src/                      # Backend (Node + TypeScript + Hono + Drizzle/SQLite)
│   ├── index.ts              # entrypoint
│   ├── app.ts                # Hono app: /v1/* + /admin/* + SPA
│   ├── config/ env, constants
│   ├── db/ schema, client, seed, migrate, migrations
│   ├── routes/ v1.ts + admin/{auth,providers,models,keys,usage}
│   ├── services/ providers, models, keys, routing, rate-limit, usage
│   ├── providers/ openai-compatible (upstream client)
│   ├── security/ crypto (AES-GCM), hash (bcrypt + key gen)
│   ├── lib/ errors, logger
│   └── types/ openai
├── dashboard/                # Dashboard SPA (React + Vite + Tailwind)
├── scripts/                  # rekey, ...
├── tests/                    # unit + integration (Vitest)
└── data/                     # (gitignored) nexgate.db
```

## Cài đặt & chạy

```bash
npm install
cp .env.example .env           # điền DB_MASTER_KEY, ADMIN_PASSWORD_HASH, upstream...
npm run db:migrate             # tạo schema
npm run db:seed                # tạo admin + provider mặc định
npm run dev                    # dev server (API + dashboard proxy)
# hoặc production:
npm run build && npm start
```

Tạo admin password hash:
```bash
node -e "console.log(require('bcryptjs').hashSync('matkhau-cua-ban',10))"
# dán kết quả vào ADMIN_PASSWORD_HASH trong .env
```

## Tài liệu

Bắt đầu từ [`plan/README.md`](plan/README.md) — mục lục toàn bộ tài liệu thiết kế.

## License

Đang xác định.
