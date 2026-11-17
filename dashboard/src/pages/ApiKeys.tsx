import { useEffect, useState } from "react";
import { api, type ApiKeyRecord } from "../api/client";
import { Card, Spinner, Button, Badge, Field, inputCls, EmptyState } from "../components/ui";
import { useToast } from "../components/Toast";
import { errorMessage } from "../lib/utils";

export function ApiKeys() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ id: string; key: string } | null>(null);
  const [formName, setFormName] = useState("");
  const [formQuota, setFormQuota] = useState("");
  const [formRpm, setFormRpm] = useState("");
  const [formWhitelist, setFormWhitelist] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ data: ApiKeyRecord[] }>("/admin/keys");
      setKeys(r.data);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: formName };
      if (formQuota) body.quotaTokens = parseInt(formQuota, 10);
      if (formRpm) body.rateLimitPerMin = parseInt(formRpm, 10);
      if (formWhitelist) body.modelWhitelist = formWhitelist.split(",").map((s) => s.trim());

      const r = await api.post<{ data: { key: string; id: string } }>("/admin/keys", body);
      setRevealedKey({ id: r.data.id, key: r.data.key });
      setShowForm(false);
      setFormName("");
      setFormQuota("");
      setFormRpm("");
      setFormWhitelist("");
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onRotate(id: string) {
    if (!confirm("Đổi key này? Key cũ sẽ bị vô hiệu hoá ngay.")) return;
    try {
      const r = await api.post<{ data: { newKey: string } }>(`/admin/keys/${id}/rotate`);
      setRevealedKey({ id, key: r.data.newKey });
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Thu hồi key này?")) return;
    try {
      await api.del(`/admin/keys/${id}`);
      toast("success", "Đã thu hồi key");
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  async function onToggle(k: ApiKeyRecord) {
    try {
      await api.patch(`/admin/keys/${k.id}`, { enabled: !k.enabled });
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="text-sm text-slate-400">Khoá API cấp cho máy client</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Huỷ" : "+ Tạo key"}</Button>
      </div>

      {/* Key reveal modal */}
      {revealedKey && (
        <div className="rounded-xl border border-brand-600 bg-brand-950 p-5">
          <p className="mb-2 text-sm font-medium text-brand-300">⚠ Key chỉ hiển thị MỘT LẦN DUY NHẤT</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-slate-900 px-3 py-2 font-mono text-sm text-brand-300">
              {revealedKey.key}
            </code>
            <Button
              onClick={() => navigator.clipboard.writeText(revealedKey.key).then(() => toast("success", "Đã copy!"))}
            >
              Copy
            </Button>
            <Button variant="secondary" onClick={() => setRevealedKey(null)}>
              Đóng
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <Card title="Tạo API key mới">
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên / ghi chú">
              <input className={inputCls} value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="may-cong-ty" />
            </Field>
            <Field label="Quota tháng (token)" hint="Để trống = không giới hạn">
              <input className={inputCls} type="number" value={formQuota} onChange={(e) => setFormQuota(e.target.value)} placeholder="1000000" />
            </Field>
            <Field label="Rate limit (req/phút)" hint="Để trống = dùng mặc định">
              <input className={inputCls} type="number" value={formRpm} onChange={(e) => setFormRpm(e.target.value)} placeholder="60" />
            </Field>
            <Field label="Model whitelist" hint="Danh sách cách nhau bằng dấu phẩy. Để trống = mọi model">
              <input className={inputCls} value={formWhitelist} onChange={(e) => setFormWhitelist(e.target.value)} placeholder="gpt-4o, gpt-4o-mini" />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Đang tạo..." : "Tạo key"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title={`API Keys (${keys.length})`}>
        {loading ? (
          <Spinner />
        ) : keys.length === 0 ? (
          <EmptyState title="Chưa có key nào" hint="Tạo key đầu tiên để client kết nối" action={<Button onClick={() => setShowForm(true)}>+ Tạo key</Button>} />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Tên</th>
                <th className="py-2 pr-4">Key</th>
                <th className="py-2 pr-4">Giới hạn</th>
                <th className="py-2 pr-4">Trạng thái</th>
                <th className="py-2">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {keys.map((k) => {
                const wl = JSON.parse(k.modelWhitelist) as string[];
                return (
                  <tr key={k.id}>
                    <td className="py-3 pr-4 font-medium">{k.name}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                      {k.keyPrefix}
                      <span className="ml-1 text-slate-600">••••••••</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-400">
                      {k.quotaTokens ? `${(k.quotaTokens / 1000).toFixed(0)}K tokens/tháng` : "∞ quota"}
                      {k.rateLimitPerMin ? ` • ${k.rateLimitPerMin}/phút` : ""}
                      {wl.length > 0 && <div className="text-xs text-brand-400">Models: {wl.join(", ")}</div>}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={k.enabled ? "green" : "red"}>{k.enabled ? "Bật" : "Tắt"}</Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        <Button variant="ghost" onClick={() => onToggle(k)}>{k.enabled ? "Tắt" : "Bật"}</Button>
                        <Button variant="secondary" onClick={() => onRotate(k.id)}>Rotate</Button>
                        <Button variant="danger" onClick={() => onDelete(k.id)}>Xoá</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
