# Plan — Tài liệu thiết kế NexGate

Toàn bộ tài liệu thiết kế, kiến trúc và kế hoạch phát triển của **NexGate** được tập trung trong thư mục này. Mỗi tài liệu xử lý một khía cạnh, đọc theo thứ tự khuyến nghị bên dưới.

## Mục lục (thứ tự đọc)

| # | File | Nội dung |
|---|------|----------|
| 1 | [`01-architecture.md`](01-architecture.md) | Kiến trúc tổng thể, luồng request, quyết định thiết kế, câu trả lời cho "cấu hình phía client đủ chưa?" |
| 2 | [`02-infrastructure.md`](02-infrastructure.md) | Hạ tầng, cách phơi gateway ra ngoài (tunnel/nhà vs chặn), các chế độ triển khai |
| 3 | [`03-tech-stack.md`](03-tech-stack.md) | Công nghệ đề xuất cho từng thành phần + rationale |
| 4 | [`04-project-structure.md`](04-project-structure.md) | Cấu trúc thư mục code, mô-đun, quy ước đặt tên |
| 5 | [`05-api-contracts.md`](05-api-contracts.md) | API contracts: OpenAI-compatible proxy + admin API |
| 6 | [`06-database-schema.md`](06-database-schema.md) | Schema database đầy đủ (bảng, quan hệ, index) |
| 7 | [`07-dashboard-design.md`](07-dashboard-design.md) | Thiết kế Dashboard (màn hình, luồng UX, component tree) |
| 8 | [`08-security.md`](08-security.md) | Bảo mật: xác thực, mã hóa, rate limit, phòng chống lạm dụng |
| 9 | [`09-roadmap.md`](09-roadmap.md) | Roadmap MVP → v1.0, theo từng phase |

## Trạng thái

- [x] Tài liệu hóa kiến trúc & thiết kế (thư mục `plan/`)
- [x] Scaffold code (theo `04-project-structure.md`)
- [x] Triển khai Proxy Core (Phase 1 — xem `09-roadmap.md`)
- [x] Dashboard & Admin API (Phase 2)
- [ ] Hardening & phát hành v1.0 (Phase 3 — checklist còn lại trong `09-roadmap.md`)
