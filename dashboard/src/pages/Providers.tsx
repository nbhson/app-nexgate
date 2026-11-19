import { useEffect, useState } from "react";
import { api, type Provider } from "../api/client";
import {
  Card, Button, Badge, Field, inputCls, EmptyState, Modal, useConfirm, TableSkeleton,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { cn, errorMessage } from "../lib/utils";

interface ProviderForm {
  name: string;
  baseUrl: string;
  apiKey: string;
}

const emptyForm: ProviderForm = { name: "", baseUrl: "", apiKey: "" };

export function Providers() {
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [form, setForm] = useState<ProviderForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; ms: number }>>({});

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

  function openCreate() {
    setForm(emptyForm);
    setEditing("new");
  }

  function openEdit(p: Provider) {
    setForm({ name: p.name, baseUrl: p.baseUrl, apiKey: "" });
    setEditing(p.id);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing === "new") {
        await api.post("/admin/providers", form);
        toast("success", "Đã thêm provider");
      } else if (editing) {
        const body: Record<string, unknown> = { name: form.name, baseUrl: form.baseUrl };
        if (form.apiKey) body.apiKey = form.apiKey; // để trống = giữ key cũ
        await api.patch(`/admin/providers/${editing}`, body);
        toast("success", "Đã cập nhật provider");
      }
      setEditing(null);
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
    const ok = await confirm({
      title: "Xoá provider",
      message: `Xoá provider "${p.name}"? Các model trỏ tới provider này sẽ không gọi được nữa.`,
      confirmLabel: "Xoá provider",
      danger: true,
    });
    if (!ok) return;
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
      setTestResult((t) => ({ ...t, [p.id]: { ok: r.ok, ms: r.latencyMs } }));
      toast(r.ok ? "success" : "error", r.ok ? `Kết nối OK (${r.latencyMs}ms)` : `Thất bại: ${r.error ?? ""}`);
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="anim-page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Providers</h1>
          <p className="text-sm text-slate-400">Các upstream provider mà gateway kết nối tới</p>
        </div>
        <Button onClick={openCreate}>+ Thêm provider</Button>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Thêm provider" : "Sửa provider"} onClose={() => setEditing(null)}>
          <form onSubmit={onSubmit} className="grid gap-4">
            <Field label="Tên">
              <input
                className={inputCls} value={form.name} required placeholder="openai-default"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Base URL">
              <input
                className={inputCls} value={form.baseUrl} required placeholder="https://api.openai.com/v1"
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              />
            </Field>
            <Field
              label={editing === "new" ? "API Key (upstream)" : "API Key mới (tuỳ chọn)"}
              hint={editing === "new" ? "Được mã hoá AES-256-GCM khi lưu" : "Để trống nếu không đổi key"}
            >
              <input
                className={inputCls} type="password" value={form.apiKey} required={editing === "new"}
                autoComplete="off"
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Huỷ</Button>
              <Button type="submit" disabled={saving}>{saving ? "Đang lưu..." : "Lưu"}</Button>
            </div>
          </form>
        </Modal>
      )}

      <Card title={`Danh sách (${providers.length})`}>
        {loading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : providers.length === 0 ? (
          <EmptyState title="Chưa có provider nào" hint="Thêm provider đầu tiên để bắt đầu" action={<Button onClick={openCreate}>+ Thêm provider</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Tên</th>
                  <th className="py-2 pr-4">Base URL</th>
                  <th className="py-2 pr-4">Kết nối</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {providers.map((p) => {
                  const t = testResult[p.id];
                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40">
                      <td className="py-3 pr-4 font-medium">{p.name}</td>
                      <td className="py-3 pr-4 text-slate-400 max-w-xs truncate">{p.baseUrl}</td>
                      <td className="py-3 pr-4">
                        {t ? (
                          <span className={cn("text-xs", t.ok ? "text-emerald-300" : "text-red-300")}>
                            {t.ok ? `OK ${t.ms}ms` : "lỗi"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">chưa test</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={p.enabled ? "green" : "slate"}>{p.enabled ? "Bật" : "Tắt"}</Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2 whitespace-nowrap">
                          <Button variant="ghost" onClick={() => onTest(p)} disabled={testing === p.id}>
                            {testing === p.id ? "..." : "Test"}
                          </Button>
                          <Button variant="ghost" onClick={() => openEdit(p)}>Sửa</Button>
                          <Button variant="ghost" onClick={() => onToggle(p)}>{p.enabled ? "Tắt" : "Bật"}</Button>
                          <Button variant="danger" onClick={() => onDelete(p)}>Xoá</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog}
    </div>
  );
}
