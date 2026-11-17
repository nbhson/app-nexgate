# 09 — Roadmap phát triển

> Lộ trình từ MVP (dùng được ngay, 1 người) đến v1.0 ổn định. Mỗi phase gắn với các tài liệu tham chiếu (`0X-*.md`) và mục tiêu rõ ràng.

## Phase 0 — Nền tảng & đọc-kèm (trước khi code)

- [x] Đọc & chốt: `01-architecture`, `02-infrastructure`, `03-tech-stack`, `04-project-structure`.
- [x] Scaffold repo: npm workspaces, TS strict, ESLint/Prettier config trong package.json, Drizzle, Vitest.
- **Tham chiếu:** toàn bộ `plan/`.

## Phase 1 — Proxy Core (MVP chạy được) 🎯

Mục tiêu: gateway proxy ra upstream hoạt động, client dùng được qua `curl` + 1 coding agent.

- [x] `GET /v1/models` (đọc catalog từ DB).
- [x] `POST /v1/chat/completions` — non-stream + stream (SSE pipe).
- [x] `POST /v1/embeddings`.
- [x] Client auth (bearer) + model whitelist.
- [x] Rate limit in-memory + quota theo token.
- [x] Upstream client: fetch, timeout, aborts, error mapping (502/504).
- [x] `usage_logs` ghi từ `usage` upstream.
- [x] `.env` config, seed admin + upstream mặc định.
- [x] **Test tích hợp:** mô phỏng upstream fake (echo), test stream chunk.
- **Tham chiếu:** `01-architecture.md` §4.1/4.2, `04-project-structure.md` §4, `05-api-contracts.md` A.

## Phase 2 — Admin API + Dashboard

Mục tiêu: quản lý mọi thứ qua UI, không cần sửa env.

- [x] Admin auth (login/session) + `/admin/providers` CRUD + test connection.
- [x] `/admin/models` CRUD.
- [x] `/admin/keys` CRUD + rotate + view-once key.
- [x] `/admin/usage` summary/timeseries/logs.
- [x] Dashboard SPA: Overview, Providers, Models, API Keys, Usage, Settings.
- [x] A11y pass + responsive (theo `07-dashboard-design.md`).
- **Tham chiếu:** `05-api-contracts.md` B, `06-database-schema.md`, `07-dashboard-design.md`.

## Phase 3 — Hardening & Phát hành

Mục tiêu: an toàn, ổn định, sẵn sàng dùng hàng ngày.

- [x] Mã hoá upstream key + rekey script (`npm run db:rekey`).
- [x] Quota tháng theo token + reset tự động.
- [x] Log structure + log rotation (pino); backup DB script (khuyến nghị `cp data/nexgate.db`).
- [ ] Bảo mật checklist (`08-security.md` §7) hoàn tất đầy đủ — chưa chạy `npm audit` / SSRF guard nâng cao.
- [ ] Cài tunnel chuẩn hoá (Cloudflare/Tailscale) + `npm run tunnel` — máy nhà của user.
- [ ] Kiểm tra từ mạng khác (máy công ty thật).
- **Tham chiếu:** `02-infrastructure.md`, `08-security.md`.

## v1.0 release 🚀 — ngưỡng "dùng được chính thức"

- [x] Test E2E đầy đủ (11 tests pass), tài liệu người dùng (README) hoàn chỉnh.
- [ ] `/v1/responses` đầy đủ (tuỳ client).
- [ ] Audit logs admin (schema đã có `audit_logs`, chưa ghi).
- [ ] Hỗ trợ multi-provider hoạt động tốt + fallback khi 1 provider lỗi (đã có CRUD provider, chưa có auto-fallback request lỗi).
- Tiêu chí: máy công ty bị chặn provider gốc vẫn dùng mượt qua gateway, có đầy đủ kiểm soát key và theo dõi usage.

## Sau v1.0 (backlog — không có trong MVP)

- Cache/condensation tiết kiệm token.
- Multi-instance + Redis + HA; Postgres migration.
- Webhook/notification khi key vượt quota.
- OpenTelemetry, dashboard đa admin, audit nâng cao.
- Plugin middleware (lọc, rewrite, personal assistants).

## Ước tính effort (solo dev, ước lượng thô)

| Phase | Effort | Việc chính |
|-------|--------|-----------|
| 0 | 0.5–1 ngày | đọc tài liệu, scaffold |
| 1 | 2–4 ngày | proxy core + auth + rate limit + test |
| 2 | 3–5 ngày | admin API + dashboard |
| 3 | 1–2 ngày | hardening, tunnel, vận hành |
| **MVP → v1.0** | **~2 tuần part-time** | |

## Điểm cắt (scope cut — biết khi "đủ")

MVP dừng khi: proxy + client auth + provider.model.manage + usage log + dashboard cơ bản hoạt động. Không đưa vào MVP: cache, HA, plugin, đa admin. Đưa vào sau khi v1.0 release.

> Trạng thái cập nhật: sau mỗi phase đánh dấu checkbox. Cập nhật plan khi có quyết định thay đổi (ghi vào file tương ứng).
