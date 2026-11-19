import { useEffect, useMemo, useState } from "react";
import {
  api, parseWhitelist,
  type ApiKeyRecord, type Model, type Provider,
} from "../api/client";
import {
  Card, Button, Badge, Field, inputCls, EmptyState,
  Modal, useConfirm, ProgressBar, TableSkeleton,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { errorMessage, formatDate } from "../lib/utils";

interface KeyForm {
  name: string;
  quota: string;
  rpm: string;
  validDays: string;
  models: string[];
  providers: string[];
}

const emptyForm: KeyForm = { name: "", quota: "", rpm: "", validDays: "", models: [], providers: [] };

export function ApiKeys() {
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  // modal: null = đóng, "new" = tạo, otherwise id đang sửa
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [form, setForm] = useState<KeyForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [r, m, p] = await Promise.all([
        api.get<{ data: ApiKeyRecord[] }>("/admin/keys"),
        api.get<{ data: Model[] }>("/admin/models"),
        api.get<{ data: Provider[] }>("/admin/providers"),
      ]);
      setKeys(r.data);
      setModels(m.data);
      setProviders(p.data);
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

  const modelsByProvider = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const m of models) {
      if (!map.has(m.providerId)) map.set(m.providerId, []);
      map.get(m.providerId)!.push(m);
    }
    return map;
  }, [models]);

  function openCreate() {
    setForm(emptyForm);
    setEditing("new");
  }

  function openEdit(k: ApiKeyRecord) {
    setForm({
      name: k.name,
      quota: k.quotaTokens ? String(k.quotaTokens) : "",
      rpm: k.rateLimitPerMin ? String(k.rateLimitPerMin) : "",
      validDays: "",
      models: parseWhitelist(k.modelWhitelist),
      providers: parseWhitelist(k.providerWhitelist),
    });
    setEditing(k.id);
  }

  function toggleModel(id: string) {
    setForm((f) => ({
      ...f,
      models: f.models.includes(id) ? f.models.filter((x) => x !== id) : [...f.models, id],
    }));
  }

  function toggleProvider(id: string) {
    setForm((f) => ({
      ...f,
      providers: f.providers.includes(id) ? f.providers.filter((x) => x !== id) : [...f.providers, id],
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        modelWhitelist: form.models,
        providerWhitelist: form.providers,
        quotaTokens: form.quota ? parseInt(form.quota, 10) : null,
        rateLimitPerMin: form.rpm ? parseInt(form.rpm, 10) : null,
      };
      if (form.validDays) {
        body.expiresAt = Date.now() + parseInt(form.validDays, 10) * 86_400_000;
      }

      if (editing === "new") {
        const r = await api.post<{ data: { key: string } }>("/admin/keys", body);
        setRevealedKey(r.data.key);
        toast("success", "Đã tạo key");
      } else if (editing) {
        await api.patch(`/admin/keys/${editing}`, body);
        toast("success", "Đã cập nhật key");
      }
      setEditing(null);
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onRotate(id: string) {
    const ok = await confirm({
      title: "Rotate key",
      message: "Đổi key này? Key cũ sẽ bị vô hiệu hoá NGAY LẬP TỨC — client đang dùng phải cập nhật key mới.",
      confirmLabel: "Đổi key",
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api.post<{ data: { newKey: string } }>(`/admin/keys/${id}/rotate`);
      setRevealedKey(r.data.newKey);
      load();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  async function onDelete(k: ApiKeyRecord) {
    const ok = await confirm({
      title: "Xoá key",
      message: `Thu hồi và xoá key "${k.name}"? Client dùng key này sẽ bị chặn ngay.`,
      confirmLabel: "Xoá key",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/admin/keys/${k.id}`);
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

  function accessSummary(k: ApiKeyRecord) {
    const wl = parseWhitelist(k.modelWhitelist);
    const pw = parseWhitelist(k.providerWhitelist);
    if (wl.length === 0 && pw.length === 0) return <Badge tone="slate">Mọi model</Badge>;
    const providerNames = pw.map((id) => providers.find((p) => p.id === id)?.name ?? id);
    return (
      <div className="flex flex-wrap gap-1 max-w-xs">
        {providerNames.map((n) => (
          <Badge key={`p-${n}`} tone="green">✓ {n} (cả provider)</Badge>
        ))}
        {wl.map((m) => (
          <Badge key={`m-${m}`} tone="amber">{m}</Badge>
        ))}
      </div>
    );
  }

  return (
    <div className="anim-page space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="text-sm text-slate-400">Khoá API cấp cho máy client — kèm quyền model &amp; provider</p>
        </div>
        <Button onClick={openCreate}>+ Tạo key</Button>
      </div>

      {/* Key reveal modal */}
      {revealedKey && (
        <Modal title="Key mới — chỉ hiển thị MỘT LẦN DUY NHẤT" onClose={() => setRevealedKey(null)}>
          <p className="mb-3 text-sm text-amber-300">⚠ Lưu lại ngay bây giờ. Hệ thống chỉ lưu băm, không xem lại được.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-slate-950 px-3 py-2 font-mono text-sm text-brand-300">
              {revealedKey}
            </code>
            <Button
              onClick={() =>
                navigator.clipboard.writeText(revealedKey).then(
                  () => toast("success", "Đã copy!"),
                  () => toast("error", "Trình duyệt chặn clipboard — hãy bôi đen và copy thủ công")
                )
              }
            >
              Copy
            </Button>
          </div>
        </Modal>
      )}

      {/* Create / edit modal */}
      {editing && (
        <Modal
          title={editing === "new" ? "Tạo API key mới" : "Sửa API key"}
          onClose={() => setEditing(null)}
          wide
        >
          <form onSubmit={onSubmit} className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tên / ghi chú">
                <input
                  className={inputCls} value={form.name} required placeholder="may-cong-ty"
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
              <Field label="Quota tháng (token)" hint="Trống = theo mặc định trong Settings">
                <input
                  className={inputCls} type="number" min="0" value={form.quota} placeholder="1000000"
                  onChange={(e) => setForm((f) => ({ ...f, quota: e.target.value }))}
                />
              </Field>
              <Field label="Rate limit (req/phút)" hint="Trống = dùng mặc định">
                <input
                  className={inputCls} type="number" min="0" value={form.rpm} placeholder="60"
                  onChange={(e) => setForm((f) => ({ ...f, rpm: e.target.value }))}
                />
              </Field>
            </div>

            {editing === "new" && (
              <Field label="Hiệu lực (ngày)" hint="Trống = vĩnh viễn">
                <input
                  className={`${inputCls} sm:max-w-[220px]`} type="number" min="1" value={form.validDays} placeholder="30"
                  onChange={(e) => setForm((f) => ({ ...f, validDays: e.target.value }))}
                />
              </Field>
            )}

            {/* Model & provider picker */}
            <fieldset className="rounded-lg border border-slate-700 p-4">
              <legend className="px-1 text-sm font-medium text-slate-300">
                Quyền truy cập model
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {form.models.length + form.providers.length === 0
                    ? "— chưa chọn: key dùng được MỌI model"
                    : `— ${form.models.length} model riêng lẻ, ${form.providers.length} provider`}
                </span>
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {providers.map((p) => {
                  const providerModels = modelsByProvider.get(p.id) ?? [];
                  const allChecked = form.providers.includes(p.id);
                  return (
                    <div key={p.id} className={`rounded-lg border p-3 ${allChecked ? "border-emerald-700/60 bg-emerald-950/20" : "border-slate-800 bg-slate-900/40"}`}>
                      <label className="flex cursor-pointer items-center gap-2 font-medium text-sm">
                        <input
                          type="checkbox" className="h-4 w-4 accent-emerald-500" checked={allChecked}
                          onChange={() => toggleProvider(p.id)}
                        />
                        {p.name}
                        <span className="ml-auto text-xs font-normal text-slate-500">
                          {allChecked ? "toàn bộ" : `${providerModels.length} model`}
                        </span>
                      </label>
                      {providerModels.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-slate-800 pt-2">
                          {providerModels.map((m) => (
                            <label key={m.exposedId} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                              <input
                                type="checkbox" className="h-3.5 w-3.5 accent-brand-500"
                                checked={allChecked || form.models.includes(m.exposedId)}
                                disabled={allChecked}
                                onChange={() => toggleModel(m.exposedId)}
                              />
                              <span className={allChecked ? "text-slate-500" : ""}>{m.exposedId}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {providerModels.length === 0 && (
                        <p className="mt-1 text-xs text-slate-600">Provider này chưa có model nào trong catalog.</p>
                      )}
                    </div>
                  );
                })}
                {providers.length === 0 && (
                  <p className="text-sm text-slate-500 sm:col-span-2">Chưa có provider nào — thêm provider trước.</p>
                )}
              </div>
            </fieldset>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Huỷ</Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving ? "Đang lưu..." : editing === "new" ? "Tạo key" : "Lưu thay đổi"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      <Card title={`API Keys (${keys.length})`}>
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : keys.length === 0 ? (
          <EmptyState title="Chưa có key nào" hint="Tạo key đầu tiên để client kết nối" action={<Button onClick={openCreate}>+ Tạo key</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Tên</th>
                  <th className="py-2 pr-4">Key</th>
                  <th className="py-2 pr-4">Quyền model</th>
                  <th className="py-2 pr-4">Quota tháng</th>
                  <th className="py-2 pr-4">Dùng cuối</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-800/40">
                    <td className="py-3 pr-4 font-medium">
                      {k.name}
                      {k.expiresAt && k.expiresAt < Date.now() && (
                        <div className="text-xs text-red-400">hết hạn</div>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-400">
                      {k.keyPrefix}
                      <span className="ml-1 text-slate-600">••••••••</span>
                    </td>
                    <td className="py-3 pr-4">{accessSummary(k)}</td>
                    <td className="py-3 pr-4">
                      {k.quotaTokens ? (
                        <ProgressBar value={k.quotaUsed ?? 0} max={k.quotaTokens} />
                      ) : (
                        <span className="text-xs text-slate-500">∞ không giới hạn</span>
                      )}
                      {k.rateLimitPerMin ? (
                        <div className="mt-0.5 text-xs text-slate-500">{k.rateLimitPerMin}/phút</div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-400">
                      {k.lastUsedAt ? formatDate(k.lastUsedAt) : "chưa dùng"}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={k.enabled ? "green" : "red"}>{k.enabled ? "Bật" : "Tắt"}</Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2 whitespace-nowrap">
                        <Button variant="ghost" onClick={() => openEdit(k)}>Sửa</Button>
                        <Button variant="ghost" onClick={() => onToggle(k)}>{k.enabled ? "Tắt" : "Bật"}</Button>
                        <Button variant="secondary" onClick={() => onRotate(k.id)}>Rotate</Button>
                        <Button variant="danger" onClick={() => onDelete(k)}>Xoá</Button>
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
