# 10 — Hướng dẫn triển khai (Deployment Guide) 📘

> Hướng dẫn từng-bước cài đặt NexGate trên **máy nhà (gateway)** và cấu hình **máy công ty (client)**. Đây mới là mục tiêu cốt lõi: *máy công ty bị chặn provider gốc, nhưng máy nhà làm gateway thì qua được.*

---

## Phần A — Setup trên MÁY NHÀ (Gateway host)

### A.0 Yêu cầu trước

- Máy nhà có **Node.js ≥ 20** (`node -v`).
- Máy nhà **truy cập được provider gốc** (vd `https://api.openai.com/v1`).
- Đã có **API key của provider gốc** (upstream key) — khoá này chỉ nằm ở máy nhà.

```bash
node -v   # nên >= 20
npm -v
```

Nếu chưa có Node: cài qua [nvm](https://github.com/nvm-sh/nvm) — `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash` rồi `nvm install 20`.

---

### A.1 Clone repo & cài dependencies

```bash
cd ~
git clone https://github.com/nbhson/app-nexgate.git
cd app-nexGate

npm install      # cài cả backend lẫn dashboard (npm workspaces)
```

---

### A.2 Tạo file `.env`

```bash
cp .env.example .env
```

Sinh 2 giá trị bí mật rồi điền vào `.env`:

```bash
# 1. Master key mã hoá upstream key — copy output dán vào DB_MASTER_KEY
openssl rand -base64 32

# 2. Hash mật khẩu dashboard — copy output dán vào ADMIN_PASSWORD_HASH
node -e "console.log(require('bcryptjs').hashSync('MAT_KHAU_CUA_BAN',10))"

# 3. Sinh secret chữ ký phiên đăng nhập
openssl rand -base64 32
```

Sửa `.env`:

```dotenv
PORT=3000
HOST=127.0.0.1
NODE_ENV=production          # ← đặt production
LOG_LEVEL=info

DATABASE_URL=file:./data/nexgate.db
DB_MASTER_KEY=<output-lệnh-1>        # 32 bytes base64
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<output-lệnh-2>  # $2a$10$...
ADMIN_SESSION_SECRET=<output-lệnh-3>

# Upstream provider gốc (chỉ dùng cho seed lần đầu)
UPSTREAM_BASE_URL=https://api.openai.com/v1   # thay bằng provider thật của bạn
UPSTREAM_API_KEY=sk-UPSTREAM_THAT_CUA_BAN

RATE_LIMIT_DEFAULT=60
CONCURRENCY_LIMIT=5
MAX_BODY_SIZE_MB=32
UPSTREAM_CONNECT_TIMEOUT_MS=10000
UPSTREAM_READ_TIMEOUT_MS=120000
```

> ⚠️ `NODE_ENV=production` là bắt buộc cho bảo mật — khi đó `DB_MASTER_KEY`, `ADMIN_SESSION_SECRET` phải được đặt hoặc server sẽ từ chối chạy.

---

### A.3 Khởi tạo database

```bash
npm run db:migrate    # tạo schema (data/nexgate.db)
npm run db:seed       # tạo admin + upstream provider mặc định từ .env
```

---

### A.4 Build & chạy (production)

```bash
npm run build         # compile TS backend + bundle dashboard
npm start             # chạy từ dist/index.js
```

Kiểm tra server sống:

```bash
curl http://127.0.0.1:3000/healthz
# {"status":"ok","version":"1.0.0","db":"up",...}
```

---

### A.5 Chạy nền (tuỳ chọn, khuyến nghị)

Để server chạy mãi không cần giữ terminal — dùng `pm2`:

```bash
npm install -g pm2
pm2 start dist/index.js --name nexgate
pm2 save
pm2 startup          # tự chạy khi khởi động máy (làm theo output)

# log server
pm2 logs nexgate
```

> Lưu ý: `npm start` = `node dist/index.js`. Nếu dùng pm2 thì trỏ thẳng tới `dist/index.js` như trên.

---

### A.6 Phơi gateway ra ngoài — TUNNEL (quan trọng!)

Máy nhà thường **không có IP tĩnh / sau NAT** ⇒ máy công ty chưa thể gọi trực tiếp tới `127.0.0.1`. Giải pháp: **Cloudflare Tunnel** (miễn phí, không cần IP tĩnh, tự HTTPS, ẩn IP máy nhà). *(Xem bảng so sánh phương án trong `plan/02-infrastructure.md`.)*

**Cách 1 — Tunnel tạm (nhanh nhất, test):**

```bash
# cài cloudflared (macOS)
brew install cloudflared

# chạy tunnel — tự đọc PORT từ .env (không hardcode 3000)
npm run tunnel
```

Bạn sẽ nhận link dạng `https://xxx-random.trycloudflare.com`. Dùng link đó về sau.

**Cách 2 — Tunnel với domain riêng (ổn định, lâu dài):**

```bash
# 1. Đăng nhập & tạo tunnel
cloudflared tunnel login
cloudflared tunnel create nexgate          # tạo tunnel, output 1 UUID

# 2. Cấu hình /etc/cloudflared/config.yml (thay <TUNNEL-UUID>)
cat > ~/.cloudflared/config.yml <<EOF
tunnel: <TUNNEL-UUID>
credentials-file: /etc/cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: nexgate.yourdomain.com
    service: http://127.0.0.1:3000
  - service: http_status:404
EOF

# 3. Route DNS (thay yourdomain.com, nexgate)
cloudflared tunnel route dns <TUNNEL-UUID> nexgate.yourdomain.com

# 4. Chạy
cloudflared tunnel run nexgate
```

Sau bước này bạn có base URL công khai ổn định:
```
https://nexgate.yourdomain.com
```

---

### A.7 Cấu hình qua Dashboard

Mở `https://nexgate.yourdomain.com/` (hoặc khi test: `http://127.0.0.1:<PORT>/`) — đăng nhập bằng `ADMIN_USERNAME` + mật khẩu đã chọn.

> Dashboard SPA nằm ở root `/`. Đường dẫn `/admin/*` là namespace của **Admin API** (`/admin/auth`, `/admin/models`...); truy cập `/admin` sẽ tự chuyển về `/`.

Tại Dashboard:

1. **Providers** → kiểm tra provider lấy từ seed hiện diện; hoặc tạo mới → bấm **Test** để xác nhận kết nối upstream OK.
2. **Models** → thêm các model cần expose:
   - *Exposed ID*: tên client sẽ thấy (vd `gpt-4o`).
   - *Provider*: chọn provider.
   - *Upstream Model ID*: để trống nếu trùng tên; khác thì ghi id thật của provider (vd `gpt-4o-2024-08-06`).
3. **API Keys** → **Tạo key**:
   - Đặt tên (vd `may-cong-ty`, `mac-home`).
   - (tuỳ chọn) giới hạn quota tháng / rate limit / whitelist model.
   - **Bấm Copy ngay** — key chỉ hiện **1 lần duy nhất**!

   Key có dạng: `sk-nex_abc123_wxyz...`

---

### A.8 (Tùy chọn) Cấu hình client key cho nhiều máy

Mỗi máy client nên có **1 key riêng** để dễ quản lý/quota/revoke từng máy. Tạo nhiều key trong Dashboard, gán tên + giới hạn khác nhau.

---

## Phần B — Setup trên MÁY CÔNG TY (Client)

Máy công ty **KHÔNG cần cài NexGate**. Chỉ cần cấu hình **Custom Provider** trong coding agent, trỏ về base URL của gateway.

### B.1 Thông tin cần có

- **Base URL**: `https://nexgate.yourdomain.com/v1` (hoặc link `trycloudflare.com` khi test).
- **API Key**: `sk-nex_...` (tạo ở bước A.7).
- **Model**: một trong các model đã expose ở bước A.7 (vd `gpt-4o`).

### B.2 Cấu hình theo từng coding agent

**OpenCode** — file cấu hình provider (`~/.config/opencode/opencode.json`):

```json
{
  "provider": {
    "nexgate": {
      "type": "openai-compatible",
      "baseURL": "https://nexgate.yourdomain.com/v1",
      "apikey": "sk-nex_THE_KEY_YOURS",
      "models": ["gpt-4o"]
    }
  }
}
```

**Cursor** — Settings → Models → **Add**:
- Provider: OpenAI (hoặc custom) → bật override: base URL `https://nexgate.yourdomain.com/v1`, key `sk-nex_...`, thêm model `gpt-4o`.

**Claude Code / tiếp CLI khác dùng OpenAI-compatible**: thiết lập 3 biến:
```bash
export OPENAI_BASE_URL=https://nexgate.yourdomain.com/v1
export OPENAI_API_KEY=sk-nex_THE_KEY_YOURS
export OPENAI_MODEL=gpt-4o
```

**Ví dụ tổng quát (mọi tool hỗ trợ OpenAI-compatible)**:
```
Base URL  : https://nexgate.yourdomain.com/v1
API Key   : sk-nex_THE_KEY_YOURS
Model     : gpt-4o
```

---

### B.3 Kiểm tra nhanh từ máy công ty

```bash
curl https://nexgate.yourdomain.com/v1/models \
  -H "Authorization: Bearer sk-nex_THE_KEY_YOURS"
# → {"object":"list","data":[...]} 

curl https://nexgate.yourdomain.com/v1/chat/completions \
  -H "Authorization: Bearer sk-nex_THE_KEY_YOURS" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"xin chao"}]}'
```

Nếu ra JSON chat hoàn chỉnh → máy công ty đã dùng gateway thành công 🎉

---

## Phần C — Vận hành & khắc phục

### C.1 Kiểm tra usage

Dashboard → **Usage** hoặc Overview: xem số request, tokens, latency, status theo từng key. Mỗi request qua gateway đều ghi vào `usage_logs`.

### C.2 Log server (máy nhà)

```bash
pm2 logs nexgate             # nếu dùng pm2
# hoặc xem output terminal khi npm start
```

Lỗi thường gặp & xử lý:

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `404 Unknown model` | Model chưa thêm vào Dashboard | Thêm model ở Models |
| `401 Invalid API key` | Key sai/disabled/hết hạn | Tạo key mới, kiểm tra whitelist |
| `503/502 Upstream` | Provider gốc lỗi / key upstream sai | Dashboard → Provider → Test; sửa `UPSTREAM_API_KEY` |
| `429 rate limit / quota` | Vượt giới hạn key | Tăng `rate_limit_per_min` / `quota_tokens` cho key |
| Không truy cập được từ công ty | Tunnel ngừng / máy nhà tắt | Kiểm tra `cloudflared tunnel run`, uptime máy nhà |

### C.3 Backup & nâng cấp

```bash
# backup DB (chứa providers + keys + usage)
cp data/nexgate.db data/nexgate.db.bak.$(date +%Y%m%d)

# upgrade
git pull
npm install
npm run build
pm2 restart nexgate
```

### C.4 Đổi master key → re-encrypt toàn bộ provider key

```bash
# 1. cập nhật DB_MASTER_KEY mới trong .env
# 2. chạy rekey (dùng key MỚI để mã hoá lại toàn bộ)
npm run db:rekey
```

---

## Tóm tắt luồng 2 phía

```
[MÁY NHÀ]                          [MÁY CÔNG TY]
 npm run build && npm start         coding agent:
 cloudflared tunnel run nexgate      baseURL = https://nexgate.yourdomain.com/v1
 Dashboard: create key sk-nex_...    apikey   = sk-nex_...
                                     model    = gpt-4o
  ↑ gateway chuyển tiếp lên provider gốc (chỉ máy nhà truy cập được)
```

> ⚠️ Cấu hình ở **CẢ HAI** phía, nhưng khác lớp: máy nhà giữ `UPSTREAM_API_KEY` (provider gốc); máy công ty chỉ dùng `sk-nex_...` do Dashboard cấp. Máy công ty **không bao giờ biết** key/provider gốc.
