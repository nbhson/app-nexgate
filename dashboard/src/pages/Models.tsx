import { useEffect, useState } from "react";
import { api, type Model, type Provider } from "../api/client";
import {
  Card, Button, Badge, Field, inputCls, EmptyState, Modal, useConfirm, TableSkeleton,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { errorMessage } from "../lib/utils";

interface ModelForm {
  exposedId: string;
  providerId: string;
  upstreamModelId: string;
  maxTokens: string;
  costIn: string;
  costOut: string;
}

const emptyForm: ModelForm = { exposedId: "", providerId: "", upstreamModelId: "", maxTokens: "", costIn: "", costOut: "" };

export function Models() {
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<null | "new" | string>(null); // exposedId đang sửa
  const [form, setForm] = useState<ModelForm>(emptyForm);
  const [saving, setSaving] = useState(false);

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

  function openCreate() {
    setForm(emptyForm);
    setEditing("new");
  }

  function openEdit(m: Model) {
    setForm({
      exposedId: m.exposedId,
      providerId: m.providerId,
      upstreamModelId: m.upstreamModelId === m.exposedId ? "" : m.upstreamModelId,
      maxTokens: m.maxTokens ? String(m.maxTokens) : "",
      costIn: m.costInputPer1k != null ? String(m.costInputPer1k) : "",
      costOut: m.costOutputPer1k != null ? String(m.costOutputPer1k) : "",
    });
    setEditing(m.exposedId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        providerId: form.providerId,
        upstreamModelId: form.upstreamModelId || form.exposedId,
        maxTokens: form.maxTokens ? parseInt(form.maxTokens, 10) : null,
        costInputPer1k: form.costIn ? parseFloat(form.costIn) : null,
        costOutputPer1k: form.costOut ? parseFloat(form.costOut) : null,
      };
      if (editing === "new") {
        await api.post("/admin/models", { exposedId: form.exposedId, ...payload });
        toast("success", "Đã thêm model");
      } else if (editing) {
        await api.patch(`/admin/models/${encodeURIComponent(editing)}`, payload);
        toast("success", "Đã cập nhật model");
      }
      setEditing(null);
      loadAll();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(m: Model) {
    try {
      await api.patch(`/admin/models/${encodeURIComponent(m.exposedId)}`, { enabled: !m.enabled });
      loadAll();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  async function onDelete(m: Model) {
    const ok = await confirm({
      title: "Xoá model",
      message: `Xoá model "${m.exposedId}"? Client gọi model này sẽ nhận 404.`,
      confirmLabel: "Xoá model",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/admin/models/${encodeURIComponent(m.exposedId)}`);
      toast("success", "Đã xoá model");
      loadAll();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="anim-page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Models</h1>
          <p className="text-sm text-slate-400">Catalog model expose cho client</p>
        </div>
        <Button onClick={openCreate}>+ Thêm model</Button>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Thêm model" : `Sửa model — ${editing}`} onClose={() => setEditing(null)}>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Exposed ID (client thấy)">
              <input
                className={inputCls} value={form.exposedId} required={editing === "new"}
                readOnly={editing !== "new"}
                onChange={(e) => setForm((f) => ({ ...f, exposedId: e.target.value }))}
                placeholder="gpt-4o"
              />
            </Field>
            <Field label="Provider">
              <select
                className={inputCls} value={form.providerId} required
                onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))}
              >
                <option value="">— chọn provider —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Upstream Model ID" hint="Để trống nếu trùng với exposed ID">
                <input
                  className={inputCls} value={form.upstreamModelId}
                  onChange={(e) => setForm((f) => ({ ...f, upstreamModelId: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Max tokens" hint="Không bắt buộc">
              <input
                className={inputCls} type="number" min="1" value={form.maxTokens} placeholder="8192"
                onChange={(e) => setForm((f) => ({ ...f, maxTokens: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giá in /1K" hint="USD, để trống = chưa biết">
                <input
                  className={inputCls} type="number" step="0.0001" min="0" value={form.costIn} placeholder="0.0025"
                  onChange={(e) => setForm((f) => ({ ...f, costIn: e.target.value }))}
                />
              </Field>
              <Field label="Giá out /1K" hint="USD">
                <input
                  className={inputCls} type="number" step="0.0001" min="0" value={form.costOut} placeholder="0.01"
                  onChange={(e) => setForm((f) => ({ ...f, costOut: e.target.value }))}
                />
              </Field>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Huỷ</Button>
              <Button type="submit" disabled={saving || !form.providerId}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <Card title={`Catalog (${models.length})`}>
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : models.length === 0 ? (
          <EmptyState title="Chưa có model nào" hint="Thêm model để client có thể dùng" action={<Button onClick={openCreate}>+ Thêm model</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Exposed ID</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Upstream ID</th>
                  <th className="py-2 pr-4">Giới hạn / giá</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {models.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/40">
                    <td className="py-3 pr-4 font-mono text-xs">{m.exposedId}</td>
                    <td className="py-3 pr-4 text-slate-300">{providerName(m.providerId)}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                      {m.upstreamModelId === m.exposedId ? "(trùng)" : m.upstreamModelId}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-400">
                      {m.maxTokens ? `${m.maxTokens.toLocaleString()} max tokens` : "—"}
                      {m.costInputPer1k != null && (
                        <div className="text-brand-300/80">
                          ${m.costInputPer1k}/1K in · ${m.costOutputPer1k ?? 0}/1K out
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={m.enabled ? "green" : "slate"}>{m.enabled ? "Bật" : "Tắt"}</Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2 whitespace-nowrap">
                        <Button variant="ghost" onClick={() => openEdit(m)}>Sửa</Button>
                        <Button variant="ghost" onClick={() => onToggle(m)}>{m.enabled ? "Tắt" : "Bật"}</Button>
                        <Button variant="danger" onClick={() => onDelete(m)}>Xoá</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog}
    </div>
  );
}
