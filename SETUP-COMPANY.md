# NexGate — Setup máy công ty (Client) 🏢

> Máy công ty **KHÔNG cần cài NexGate / Node / Cloudflared**. Chỉ cần cấu hình
> **Custom Provider** trong coding agent, trỏ về base URL của gateway máy nhà.
> Chi tiết đầy đủ xem `plan/10-deployment-guide.md` (Phần B).

---

## 1. Thông tin cần có (hỏi chủ máy nhà)

| Thông tin | Ví dụ |
|---|---|
| Base URL | `https://<domain>.trycloudflare.com/v1` hoặc `https://nexgate.yourdomain.com/v1` |
| API Key  | `sk-nex_...` (cấp trên Dashboard máy nhà) |
| Model    | `gpt-4o` hoặc model đã expose trên gateway |

> Máy công ty **không bao giờ** biết key/provider gốc — đó là điểm mấu chốt.

---

## 2. Cấu hình theo từng coding agent

### OpenCode — `~/.config/opencode/opencode.json`
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

### Claude Code / CLI dùng OpenAI-compatible
```bash
export OPENAI_BASE_URL=https://nexgate.yourdomain.com/v1
export OPENAI_API_KEY=sk-nex_THE_KEY_YOURS
export OPENAI_MODEL=gpt-4o
```

### Cursor
Settings → Models → Add → override base URL `https://nexgate.yourdomain.com/v1`, key `sk-nex_...`, thêm model `gpt-4o`.

---

## 3. Kiểm tra nhanh từ máy công ty
```bash
curl https://nexgate.yourdomain.com/v1/models \
  -H "Authorization: Bearer sk-nex_THE_KEY_YOURS"

curl https://nexgate.yourdomain.com/v1/chat/completions \
  -H "Authorization: Bearer sk-nex_THE_KEY_YOURS" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"xin chao"}]}'
```
Nếu ra JSON chat hoàn chỉnh → máy công ty đã dùng gateway thành công 🎉

---

## 4. Xử lý lỗi thường gặp
| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| `401 Invalid API key` | Key sai / disabled / hết hạn | Tạo key mới trên Dashboard |
| `404 Unknown model` | Model chưa expose | Thêm model ở Dashboard → Models |
| `503/502 Upstream` | Provider gốc lỗi / key upstream sai | Báo chủ máy nhà kiểm tra |
| `429 rate limit/quota` | Vượt giới hạn key | Nhờ tăng giới hạn trên Dashboard |
| Không truy cập được | Tunnel ngừng / máy nhà tắt | Báo chủ máy nhà |
