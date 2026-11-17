import { useEffect, useState } from "react";
import { api, type Model, type Provider } from "../api/client";
import { Card, Spinner, Button, Badge, Field, inputCls, EmptyState } from "../components/ui";
import { useToast } from "../components/Toast";
import { errorMessage } from "../lib/utils";

export function Models() {
  const { toast } = useToast();
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [exposedId, setExposedId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [upstreamModelId, setUpstreamModelId] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([
        api.get<{ data: Model[] }>("/admin/models"),
        api.get<{ data: Provider[] }>("/admin/providers"),
      ]);
      setModels(m.data);
      setProviders(p.data);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/models", {
        exposedId,
        providerId,
        upstreamModelId: upstreamModelId || exposedId,
      });
      toast("success", "Đã thêm model");
      setShowForm(false);
      setExposedId("");
      setProviderId("");
      setUpstreamModelId("");
      loadAll();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(m: Model) {
    if (!confirm(`Xoá model "${m.exposedId}"?`)) return;
    try {
      await api.del(`/admin/models/${m.exposedId}`);
      toast("success", "Đã xoá model");
      loadAll();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Models</h1>
          <p className="text-sm text-slate-400">Catalog model expose cho client</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Huỷ" : "+ Thêm model"}</Button>
      </div>

      {showForm && (
        <Card title="Thêm model">
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Exposed ID (client thấy)">
              <input className={inputCls} value={exposedId} onChange={(e) => setExposedId(e.target.value)} required placeholder="gpt-4o" />
            </Field>
            <Field label="Provider">
              <select
                className={inputCls}
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                required
              >
                <option value="">— chọn provider —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Upstream Model ID" hint="Để trống nếu trùng với exposed ID">
                <input className={inputCls} value={upstreamModelId} onChange={(e) => setUpstreamModelId(e.target.value)} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving || !providerId}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title={`Catalog (${models.length})`}>
        {loading ? (
          <Spinner />
        ) : models.length === 0 ? (
          <EmptyState title="Chưa có model nào" hint="Thêm model để client có thể dùng" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="py-2 pr-4">Exposed ID</th>
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Upstream ID</th>
                <th className="py-2 pr-4">Trạng thái</th>
                <th className="py-2">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {models.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 pr-4 font-mono text-xs">{m.exposedId}</td>
                  <td className="py-3 pr-4 text-slate-400">{providerName(m.providerId)}</td>
                  <td className="py-3 pr-4 text-slate-400">{m.upstreamModelId}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={m.enabled ? "green" : "slate"}>{m.enabled ? "Bật" : "Tắt"}</Badge>
                  </td>
                  <td className="py-3">
                    <Button variant="danger" onClick={() => onDelete(m)}>
                      Xoá
                    </Button>
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
