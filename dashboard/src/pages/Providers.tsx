import { useEffect, useState } from "react";
import { api, type Provider } from "../api/client";
import { Card, Spinner, Button, Badge, Field, inputCls, EmptyState } from "../components/ui";
import { useToast } from "../components/Toast";
import { cn, errorMessage } from "../lib/utils";

export function Providers() {
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  // form state
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<{ data: Provider[] }>("/admin/providers");
      setProviders(r.data);
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
      await api.post("/admin/providers", { name, baseUrl, apiKey });
      toast("success", "Đã thêm provider");
      setShowForm(false);
      setName("");
      setBaseUrl("");
      setApiKey("");
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(p: Provider) {
    try {
      await api.patch(`/admin/providers/${p.id}`, { enabled: !p.enabled });
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  async function onDelete(p: Provider) {
    if (!confirm(`Xoá provider "${p.name}"?`)) return;
    try {
      await api.del(`/admin/providers/${p.id}`);
      toast("success", "Đã xoá provider");
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  async function onTest(p: Provider) {
    setTesting(p.id);
    try {
      const r = await api.post<{ ok: boolean; latencyMs: number; error?: string }>(`/admin/providers/${p.id}/test`);
      toast(r.ok ? "success" : "error", r.ok ? `Kết nối OK (${r.latencyMs}ms)` : `Thất bại: ${r.error ?? ""}`);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Providers</h1>
          <p className="text-sm text-slate-400">Các upstream provider mà gateway kết nối tới</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Huỷ" : "+ Thêm provider"}</Button>
      </div>

      {showForm && (
        <Card title="Thêm provider">
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required placeholder="openai-default" />
            </Field>
            <Field label="Base URL">
              <input className={inputCls} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required placeholder="https://api.openai.com/v1" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="API Key (upstream)" hint="Được mã hoá AES-256-GCM khi lưu">
                <input className={inputCls} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title={`Danh sách (${providers.length})`}>
        {loading ? (
          <Spinner />
        ) : providers.length === 0 ? (
          <EmptyState title="Chưa có provider nào" hint="Thêm provider đầu tiên để bắt đầu" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Tên</th>
                <th className="py-2 pr-4">Base URL</th>
                <th className="py-2 pr-4">Trạng thái</th>
                <th className="py-2 pr-4">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {providers.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-4 font-medium">{p.name}</td>
                  <td className="py-3 pr-4 text-slate-400">{p.baseUrl}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={p.enabled ? "green" : "slate"}>{p.enabled ? "Bật" : "Tắt"}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => onTest(p)} disabled={testing === p.id}>
                        {testing === p.id ? "..." : "Test"}
                      </Button>
                      <Button variant="ghost" onClick={() => onToggle(p)}>
                        {p.enabled ? "Tắt" : "Bật"}
                      </Button>
                      <Button variant="danger" onClick={() => onDelete(p)}>
                        Xoá
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
