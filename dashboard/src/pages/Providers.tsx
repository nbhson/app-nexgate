import { useRef, useState } from "react";
import { Eye, EyeOff, Plus, Server, Zap } from "lucide-react";
import { api, type Provider } from "../api/client";
import {
  Card, Button, Badge, Field, inputCls, EmptyState, Modal, useConfirm, TableSkeleton,
  PageHeader, RefreshControls, SyncErrorBanner, CopyButton,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { usePolling } from "../hooks/usePolling";
import { errorMessage } from "../lib/utils";
interface ProviderForm {
  name: string;
  baseUrl: string;
  apiKey: string;
}

interface TestResult {
  ok: boolean;
  ms: number;
  error?: string;
}

const emptyForm: ProviderForm = { name: "", baseUrl: "", apiKey: "" };
const POLL_MS = 15_000;

export function Providers() {
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<null | "new" | string>(null);
  const [form, setForm] = useState<ProviderForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestResult>>({});
  const testResultRef = useRef(testResult);
  const autoTestingRef = useRef(false);

  function setTest(p: Provider, r: TestResult) {
    testResultRef.current = { ...testResultRef.current, [p.id]: r };
    setTestResult(testResultRef.current);
  }

  async function probe(p: Provider, notify: boolean) {
    try {
      const r = await api.post<{ ok: boolean; latencyMs: number; error?: string }>(
        `/admin/providers/${p.id}/test`
      );
      setTest(p, { ok: r.ok, ms: r.latencyMs, error: r.error });
      if (notify) toast(r.ok ? "success" : "error", r.ok ? `Kết nối OK (${r.latencyMs}ms)` : `Thất bại: ${r.error ?? ""}`);
    } catch (err) {
      setTest(p, { ok: false, ms: 0, error: errorMessage(err) });
      if (notify) toast("error", errorMessage(err));
    }
  }

  /** Test nền lần lượt những provider chưa có kết quả — không spam toast. */
  async function ensureTested(list: Provider[]) {
    if (autoTestingRef.current) return;
    autoTestingRef.current = true;
    try {
      for (const p of list) {
        if (!p.enabled || testResultRef.current[p.id]) continue;
        await probe(p, false);
      }
    } finally {
      autoTestingRef.current = false;
    }
  }

  const { refreshing, lastUpdated, error: syncError, failCount, refresh } = usePolling(
    async ({ background }) => {
      try {
        const r = await api.get<{ data: Provider[] }>("/admin/providers");
        setProviders(r.data);
        void ensureTested(r.data);
      } finally {
        if (!background) setLoading(false);
      }
    },
    POLL_MS
  );

  function openCreate() {
    setForm(emptyForm);
    setHasStoredKey(false);
    setClearKey(false);
    setShowKey(false);
    setEditing("new");
  }

  function openEdit(p: Provider) {
    setForm({ name: p.name, baseUrl: p.baseUrl, apiKey: "" });
    setHasStoredKey(Boolean(p.apiKeyEnc));
    setClearKey(false);
    setShowKey(false);
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
        else if (clearKey) body.apiKey = null; // xoá key — provider không cần key
        await api.patch(`/admin/providers/${editing}`, body);
        toast("success", "Đã cập nhật provider");
      }
      setEditing(null);
      await refresh();
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(p: Provider) {
    try {
      await api.patch(`/admin/providers/${p.id}`, { enabled: !p.enabled });
      if (p.enabled) {
        delete testResultRef.current[p.id];
        setTestResult({ ...testResultRef.current });
      }
      await refresh();
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
      await refresh();
    } catch (err) {
      toast("error", errorMessage(err));
    }
  }

  async function onTest(p: Provider) {
    setTesting(p.id);
    await probe(p, true);
    setTesting(null);
  }

  return (
    <div className="anim-page space-y-6">
      <PageHeader title="Providers" description="Các upstream provider mà gateway kết nối tới">
        <RefreshControls refreshing={refreshing} lastUpdated={lastUpdated} onRefresh={refresh} />
        <Button onClick={openCreate}>
          <Plus size={16} aria-hidden /> Thêm provider
        </Button>
      </PageHeader>

      <SyncErrorBanner error={syncError} failCount={failCount} intervalMs={POLL_MS} onRetry={refresh} />

      {editing && (
        <Modal title={editing === "new" ? "Thêm provider" : "Sửa provider"} onClose={() => setEditing(null)}>
          <form onSubmit={onSubmit} className="grid gap-4">
            <Field label="Tên">
              <input
                className={inputCls} value={form.name} required placeholder="ollama-local"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Base URL">
              <input
                className={inputCls} value={form.baseUrl} required placeholder="http://localhost:11434/v1"
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              />
            </Field>
            <Field
              label={editing === "new" ? "API Key (upstream)" : "API Key mới (tuỳ chọn)"}
              hint={
                editing === "new"
                  ? "Bỏ trống nếu local AI không đặt key. Có mã hoá AES-256-GCM khi lưu."
                  : clearKey && !form.apiKey
                    ? "Key đã lưu sẽ bị XOÁ khi bấm Lưu — provider sẽ gọi upstream không cần key"
                    : hasStoredKey
                      ? "Để trống nếu không đổi key"
                      : "Provider này đang không dùng key — điền nếu upstream yêu cầu"
              }
            >
              <div className="relative">
                <input
                  className={`${inputCls} pr-[4.5rem]`}
                  type={showKey ? "text" : "password"}
                  value={form.apiKey}
                  autoComplete="off"
                  onChange={(e) => {
                    setForm((f) => ({ ...f, apiKey: e.target.value }));
                    if (e.target.value) setClearKey(false);
                  }}
                />
                <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
                  {form.apiKey && <CopyButton value={form.apiKey} label="API key" />}
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "Ẩn API key" : "Hiện API key"}
                    aria-pressed={showKey}
                    className="btn-press rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-brand-400"
                  >
                    {showKey ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  </button>
                </div>
              </div>
              {editing !== "new" && hasStoredKey && (
                <button
                  type="button"
                  onClick={() => setClearKey((v) => !v)}
                  className="btn-press mt-1.5 self-start text-xs text-amber-400 hover:text-amber-300 focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  {clearKey ? "Huỷ việc xoá key" : "Xoá key đã lưu"}
                </button>
              )}
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
          <EmptyState
            title="Chưa có provider nào"
            hint="Thêm provider đầu tiên để bắt đầu"
            icon={<Server size={18} aria-hidden />}
            action={<Button onClick={openCreate}><Plus size={16} aria-hidden /> Thêm provider</Button>}
          />
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
                          <Badge tone={t.ok ? "green" : "red"}>
                            <span title={t.ok ? `${t.ms}ms` : t.error}>
                              {t.ok ? `OK ${t.ms}ms` : "Lỗi"}
                            </span>
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-600">
                            {p.enabled ? "đang kiểm tra..." : "—"}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={p.enabled ? "green" : "slate"}>{p.enabled ? "Bật" : "Tắt"}</Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1.5 whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => onTest(p)} disabled={testing === p.id}>
                            {testing === p.id ? "..." : <><Zap size={13} aria-hidden /> Test</>}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Sửa</Button>
                          <Button variant="ghost" size="sm" onClick={() => onToggle(p)}>{p.enabled ? "Tắt" : "Bật"}</Button>
                          <Button variant="danger" size="sm" onClick={() => onDelete(p)}>Xoá</Button>
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
