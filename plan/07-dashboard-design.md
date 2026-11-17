# 07 — Dashboard Design (UI/UX)

> Dashboard quản trị NexGate: quản lý providers, model catalog, client keys, xem usage/logs. Định hướng: **tối giản, chỉ cần ở trang chính, phục vụ 1 admin** — không over-engineer giao diện.

## 1. Nguyên tắc

- **Tối giản (minimalism):** 1 sidebar, ít màu, ít khối — hành động chính nổi bật.
- **Thao tác ít bước:** tạo key/ provider trong ≤ 2 cú click.
- **Thông tin có-chủ-đích:** mỗi trang một việc rõ; số liệu hiển thị kèm đơn vị, khoảng thời gian chọn sẵn.
- **Mobile-friendly:** admin có thể mở từ điện thoại (kiểm tra key, xem usage).
- Bám theo skill thiết kế: đảm bảo contrast (WCAG AA), keyboard-navigable, focus visible, không dùng màu single-sense cho trạng thái.

## 2. Cấu trúc màn hình (pages)

```
Login
 └─ AppLayout (Sidebar + Content)
      ├─ Overview (Dashboard chính)
      ├─ Providers
      │   ├─ List
      │   └─ Create/Edit (form + Test connection)
      ├─ Models (Catalog)
      ├─ API Keys
      │   ├─ List
      │   └─ Create (hiện key 1 lần, nút copy)
      ├─ Usage
      │   ├─ Timeseries chart + filters
      │   └─ Logs (bảng chi tiết)
      └─ Settings
```

## 3. Sidebar navigation

| Item | Icon | Route |
|------|------|-------|
| Overview | grid | `/admin` |
| Providers | server | `/admin/providers` |
| Models | cube | `/admin/models` |
| API Keys | key | `/admin/keys` |
| Usage | chart | `/admin/usage` |
| Settings | gear | `/admin/settings` |

Sidebar thu gọn trên mobile thành top bar + drawer.

## 4. Chi tiết từng trang

### 4.1 Login
- Form username + password, submit → `/admin/auth/login` → cookie.
- Lỗi: email-like text "Tên đăng nhập hoặc mật khẩu không đúng", không tiết lộ tài khoản tồn tại.
- Link cài đặt ban đầu (nếu chưa có admin) hiển thị ở Settings hoặc lần đầu chạy.

### 4.2 Overview
- **Stat cards** (4): Requests hôm nay, Tokens hôm nay, Active keys, Uptime.
- **Chart**: Requests & tokens theo 14 ngày (Recharts area chart, 2 series).
- **Recent activity**: 5 log gần nhất (thời gian, key, model, status, latency).
- CTA nhanh: "Create API key" → nhảy thẳng tới tạo key.

### 4.3 Providers
- Table: name, baseUrl, apiKey mask (`sk-****last4`), enabled toggle, actions (Test / Edit / Delete).
- Test connection: gọi `/admin/providers/:id/test`, hiện toast thành công/lỗi + latency.
- Form: name, baseUrl, apiKey (input password có show/hide), enabled switch.

### 4.4 Models
- Table: exposed id, provider, upstream model id, enabled, delete.
- Add model: modal chọn provider (dropdown), nhập exposed id + upstream model id (auto-fill exposed id nếu bỏ trống), created.

### 4.5 API Keys
- Table: name, prefix (`sk-nex_AbCd…`), limits (model whitelist, quota, rpm), status toggle, actions (Edit / Rotate / Delete / Usage).
- Create modal: name + optional limits → tạo → modal "Key đã tạo" hiển thị full key + nút Copy + cảnh báo "không thể xem lại"; bấm Close mới đóng.
- Rotate: xác nhận → key cũ bị disable ngay, trả key mới 1 lần.
- Delete: confirm dialog.

### 4.6 Usage
- Filter: date range (presets: 24h / 7d / 30d / custom), key, model.
- Charts: area tokens theo thời gian; bar requests theo model; breakdown donut theo key (top 5 + others).
- Logs table: time, key, model, provider, in/out tokens, latency, status. Cursor pagination (Load more).

### 4.7 Settings
- Instance: PORT (read-only hoặc env-guidance), default rate limit, max body size, tunnel URL hiển thị (helper copy để dán vào agent).
- Security: change admin password, rotate `DB_MASTER_KEY` hint (khiển thị script).
- Danger zone: reset data (xác nhận gõ "DELETE").

## 5. Component tree (chính)

```
AppLayout
 ├─ Sidebar
 ├─ Topbar (instance status dot, user menu)
 └─ Outlet
     ├─ StatCard[]
     ├─ UsageChart (Recharts wrapper)
     ├─ DataTable (generic: columns, sort?, actions, empty state)
     ├─ Modal (generic confirm/prompt)
     ├─ Toast (success/error)
     └─ KeyReveal (view-once key + copy)
```

## 6. Design tokens (tóm tắt)

- Neutral grays; accent: 1 màu duy nhất (xanh lam). Trạng thái: green=ok, red=error, amber=warning — kèm icon/text không chỉ dựa màu.
- Spacing: 4px base; radius 8px; shadow nhẹ.
- Typography: hệ sans hiện đại (Inter hoặc system), scale 14/16/18/24.
- Dark mode: ưu tiên phát hành dark, sau mới toggle (MVP dark-only cho đơn giản — có thể đổi).
- Responsive: ≥ 1024 sidebar cố định; < 640 top drawer.

## 7. Luồng uml (critical flows)

```
[Create API Key]                       [Add Provider]
  Dashboard → API Keys → Create          Dashboard → Providers → Add
    → điền name/limits                    → điền baseUrl/apiKey
    → Create                             → Save → Test? → Test OK
    → modal hiện key 1 lần + copy         → xuất hiện trong list
```

## 8. Yêu cầu a11y & chất lượng

- Focus ring rõ, đủ contrast (AA ≥ 4.5:1 text), labels gắn input.
- Toast: không blocking, có role="status"/"alert" đúng ngữ cảnh.
- Table sortable phím bàn phím; modal focus trap; ESC đóng.
- Empty states có copy dẫn hành động (vd: "Chưa có key — Tạo key đầu tiên").
