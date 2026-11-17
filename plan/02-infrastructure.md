# 02 — Hạ tầng & Triển khai (Infrastructure)

> Câu hỏi hạ tầng chính: "máy công ty kết nối tới máy nhà bằng đường nào?" — vì máy nhà thường không có IP tĩnh và nằm sau NAT.

## 1. Bối cảnh & ràng buộc

- Máy nhà (gateway) thường: sau NAT, không có public IP, ISP đổi IP động.
- Mạng công ty: chặn ra ngoài một số domain (provider gốc), nhưng thường vẫn cho phép https ra internet nói chung → tận dụng điều này bằng tunnel tới domain công khai.
- Mục tiêu: client công ty chỉ cần "một baseurl + một key", không bị vướng chặn provider gốc.

## 2. Các phương án phơi gateway ra ngoài

### 2.1 Cloudflare Tunnel (`cloudflared`) — Khuyến nghị MVP
- Chạy agent trên máy nhà, tạo domain `https://nex-<sub>.yourdomain.com` hoặc `trycloudflare.com`.
- Không cần IP tĩnh, không cần mở port, HTTPS tự động, hidden service (không lộ IP máy nhà).
- Hạn chế: phụ thuộc Cloudflare; băng thông miễn phí đủ cho usage cá nhân.

### 2.2 Tailscale / Headscale (Private Mesh) — Khuyến nghị nếu các bên cùng nhóm
- Cài Tailscale trên máy nhà + máy công ty → máy công ty gọi thẳng `http://<tailscale-ip>:3000/v1`.
- Không qua internet công khai, mã hóa end-to-end (WireGuard), quản lý device qua ACL.
- Hạn chế: phải cài agent ở cả 2 đích; không dùng được nếu máy công ty cấm cài phần mềm.

### 2.3 Port Forward trên router + DDNS
- Mở port 3000 từ router về máy nhà, dùng ddns.net / DuckDNS.
- Hạn chế: lộ IP thật, phức tạp NAT, an toàn kém hơn — **không khuyến nghị** trừ khi bắt buộc.

### 2.4 VPS relay (frp / ngrok)
- Khi cần uptime ổn định hơn và không phụ thuộc home network: VPS rẻ chạy `frps`, máy nhà chạy `frpc` → có IP/dedicated port cố định.
- Hạn chế: tốn chi phí VPS, công ty phải cho phép tới IP/port đó.

### Ma trận lựa chọn

| Tiêu chí | Cloudflare Tunnel | Tailscale | Port Forward | VPS frp |
|----------|:---:|:---:|:---:|:---:|
| Không cần IP tĩnh | ✅ | ✅ | ❌ (cần DDNS) | ✅ |
| Không mở port công khai | ✅ | ✅ | ❌ | ✅ |
| Ẩn IP máy nhà | ✅ | ✅ | ❌ | ✅ |
| Không cần cài agent phía client | ✅ | ❌ (cần cài) | ✅ | ✅ |
| Chi phí | 0 | 0 (bản free) | 0 | VPS |
| Độ phức tạp | Thấp | Thấp | Vừa | Trung bình |
| Độ tin cậy | Tốt | Tốt | Kém | Tốt nhất |

**Kết luận MVP:** Cloudflare Tunnel nếu client là máy "ngoài" (công ty khác mạng). Tailscale nếu toàn bộ client thuộc network tin cậy của bạn. Port forward: chỉ khi không còn lựa chọn.

## 3. Cấu trúc triển khai khuyến nghị (MVP)

```
[Máy nhà — Gateway host]
├── NexGate process (port 3000, localhost-only binding)
├── cloudflared tunnel  ──→  https://nex.my-domain.com  (hoặc trycloudflare)
└── (optional) systemd / launchd service cho auto-restart

[Máy công ty]
└── coding agent
     baseurl = https://nex.my-domain.com/v1
     apikey  = sk-nex-...
```

## 4. Yêu cầu môi trường

- Hệ điều hành: macOS (máy nhà điển hình), Linux (VPS), Windows.
- Đã cài: Node.js ≥ 20 (LTS) hoặc version theo `03-tech-stack.md`.
- Quyền: bind port local, chạy service nền (launchd/systemd).
- DNS/domain (nếu dùng Cloudflare tunnel với domain riêng).

## 5. Cấu hình & Biến môi trường

File `.env` (xem `04-project-structure.md` cho vị trí):

```env
# Server
PORT=3000
HOST=127.0.0.1            # chỉ bind local, không expose thô
NODE_ENV=production

# Admin (Dashboard)
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash>
ADMIN_SESSION_SECRET=<random 32+>

# Database
DATABASE_URL=file:./data/nexgate.db
DB_MASTER_KEY=<random 32 bytes base64>   # mã hóa upstream keys (AES-GCM)

# Upstream mặc định (nếu chưa khai báo qua Dashboard)
UPSTREAM_BASE_URL=https://xxx.com/v1
UPSTREAM_API_KEY=sk-...
UPSTREAM_MODEL_PREFIX=   # tùy chọn: tiền tố map model

# Security
RATE_LIMIT_DEFAULT=60/min per key
MAX_BODY_SIZE_MB=32
LOG_LEVEL=info
```

## 6. Quy trình triển khai từng bước

1. **Chạy NexGate test local:** `npm run dev` → test `/v1/models` bằng `curl http://127.0.0.1:3000/v1/models`.
2. **Cấu hình upstream** qua Dashboard hoặc env → xác nhận proxy gốc chạy (test `/v1/chat/completions` local).
3. **Cấp client key** đầu tiên từ Dashboard (`sk-nex-...`).
4. **Chọn phương án expose** (mặc định Cloudflare Tunnel):
   - `brew install cloudflared` (macOS) hoặc binary cho Linux.
   - `cloudflared tunnel --url http://127.0.0.1:3000` → lấy link tạm. Với domain riêng: tạo tunnel + DNS route `nex.my-domain.com`.
5. **Test từ mạng ngoài** (hoặc máy công ty):
   ```
   curl https://nex.my-domain.com/v1/models \
        -H "Authorization: Bearer sk-nex-..."
   ```
6. **Cấu hình máy công ty:** dán `baseurl`, `apikey`, chọn model → chạy agent.
7. **Bật auto-start** cho NexGate + cloudflared; cài log rotation.

## 7. Vận hành

- **Giám sát:** `/healthz` (không cần auth) → uptime, version, kết nối DB; Dashboard usage.
- **Backup:** sao lưu `data/nexgate.db` định kỳ (ưu tiên: config + log + usage).
- **Upgrade:** theo `09-roadmap.md`, giữ DB schema migration (Drizzle migrate).
- **Fallback khi máy nhà offline:** không có HA ở MVP — chấp nhận downtỉme; (v1.0) hỗ trợ standby/dual gateway tùy chọn.
