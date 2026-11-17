# 06 — Database Schema (SQLite / Drizzle)

> Schema dữ liệu cho MVP. Chuẩn `snake_case` DB, Drizzle map sang camelCase trong code. SQLite: `PRAGMA journal_mode=WAL;` — bật để đọc/ghi song song tốt hơn.

## 1. Sơ đồ quan hệ

```
providers 1───* models 1───* api_keys (whitelist model n-n)
                         api_keys 1───* usage_logs
                         api_keys 1───* rate_limits (optional, có thể in-memory)
users (admin) 1───* (audit logs optional)
```

## 2. Bảng chi tiết

### `providers` — upstream provider

| column | type | notes |
|--------|------|-------|
| `id` | text PK | `nanoid(16)` |
| `name` | text unique | label hiển thị |
| `base_url` | text not null | vd `https://xxx.com/v1` |
| `api_key_enc` | text not null | mã hoá AES-256-GCM, nonce trước ciphertext |
| `enabled` | boolean default true | |
| `created_at` | integer | unix ms |
| `updated_at` | integer | |

### `models` — catalog model expose

| column | type | notes |
|--------|------|-------|
| `id` | integer PK autoincrement | |
| `exposed_id` | text unique not null | id client thấy: `gpt-4o` |
| `provider_id` | text FK → providers | |
| `upstream_model_id` | text not null | id thật phía upstream |
| `enabled` | boolean default true | |
| `max_tokens` | int nullable | giới hạn mặc định (optional) |
| `created_at` | integer | |

> Nếu `upstream_model_id` trống → dùng `exposed_id` làm model upstream.

### `api_keys` — client keys (cho máy công ty)

| column | type | notes |
|--------|------|-------|
| `id` | text PK | `nanoid(16)` |
| `name` | text not null | ghi chú: "may-cong-ty", "mac-home" |
| `key_hash` | text unique not null | SHA-256 của `sk-nex-...` — **không lưu plaintext** |
| `key_prefix` | text | `sk-nex_AbCdEf` để hiển thị/tra cứu |
| `enabled` | boolean default true | |
| `model_whitelist` | json text default `'[]'` | rỗng = cho phép mọi model trong catalog |
| `quota_tokens` | int nullable | quota tháng (token), null = không giới hạn |
| `quota_reset_day` | int default 1 | ngày reset quota mỗi tháng |
| `rate_limit_per_min` | int nullable | null = dùng default instance |
| `created_at` | integer | |
| `expires_at` | integer nullable | TTL tùy chọn |

### `usage_logs` — mỗi request (thực thi trên thực tế)

| column | type | notes |
|--------|------|-------|
| `id` | integer PK autoincrement | |
| `api_key_id` | text FK → api_keys (index) | |
| `model_id` | text FK → models.exposed_id (index) | |
| `provider_id` | text FK → providers | |
| `request_id` | text | id nội bộ debug |
| `input_tokens` | int default 0 | từ `usage.prompt_tokens` upstream |
| `output_tokens` | int default 0 | từ `usage.completion_tokens` |
| `total_tokens` | int default 0 | |
| `latency_ms` | int | thời gian proxy |
| `status_code` | int | response status |
| `error_code` | text nullable | mã lỗi nếu có |
| `streamed` | boolean | có stream hay không |
| `created_at` | integer | unix ms |

**Index:** `(api_key_id, created_at)`, `(model_id, created_at)`, `(created_at)` — phục vụ biểu đồ usage nhanh. SQLite nên tạo index riêng; với MVP mức log lớn hẹp (hàng trăm nghìn/tháng) query theo window + group-by là đủ.

### `admins` — người dùng dashboard

| column | type | notes |
|--------|------|-------|
| `id` | integer PK autoincrement | |
| `username` | text unique not null | |
| `password_hash` | text not null | bcrypt |
| `created_at` | integer | |

### (v1.0) `audit_logs` — nhật ký hành vi admin (optional)

| column | type | notes |
|--------|------|-------|
| `id` | integer PK | |
| `admin_id` | int FK | |
| `action` | text | `key.create`, `provider.update`, ... |
| `target` | text nullable | |
| `ip` | text nullable | |
| `created_at` | integer | |

## 3. Drizzle schema mẫu (TS)

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  apiKeyEnc: text("api_key_enc").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

## 4. Migration & seed

- Dùng `drizzle-kit generate` + `migrate`; migration file lưu `src/db/migrations/`.
- `seed.ts`: tạo admin mặc định (env `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` nếu chưa có), nạp providers từ env `UPSTREAM_*`, nạp model mẫu nếu chưa có.
- Upstream key: encrypt bằng `DB_MASTER_KEY`; nếu đổi master key → phải re-encrypt (script `rekey`).

## 5. Khối lượng & hiệu năng (ước tính MVP)

- Client keys: đơn vị → tốt (vài chục).
- Models: đơn vị → vài trăm.
- Usage logs: ~5k–200k/tháng → SQLite WAL xử lý thoải mái. Khi vượt ~ vài triệu/tháng hoặc cần multi-instance → chuyển Postgres (same Drizzle schema).
