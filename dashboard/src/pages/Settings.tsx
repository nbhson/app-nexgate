import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { api, type SettingItem, type AuditLogRecord } from "../api/client";
import { Card, Button, Badge, inputCls, EmptyState, TableSkeleton, PageHeader } from "../components/ui";
import { useToast } from "../components/Toast";
import { errorMessage, formatDate } from "../lib/utils";

export function Settings() {
  const { toast } = useToast();
  const [health, setHealth] = useState<{ version: string; uptime: number; db: string } | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const [items, setItems] = useState<SettingItem[]>([]);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = useState(false);

  const [audit, setAudit] = useState<AuditLogRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ status: string; version: string; db: string; uptime: number }>("/healthz")
      .then((r) => {
        setHealth({ version: r.version, uptime: r.uptime, db: r.db });
        setBaseUrl(window.location.origin);
      })
      .catch((err) => toast("error", errorMessage(err)));

    Promise.all([
      api.get<{ data: SettingItem[] }>("/admin/settings"),
      api.get<{ data: AuditLogRecord[] }>("/admin/audit?limit=50"),
    ])
      .then(([s, a]) => {
        setItems(s.data);
        setDraft(Object.fromEntries(s.data.map((x) => [x.key, x.kind === "bool" ? Boolean(x.value) : String(x.value)])));
        setAudit(a.data);
      })
      .catch((err) => toast("error", errorMessage(err)))
      .finally(() => {
        setLoading(false);
        setAuditLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = items.some((it) =>
    it.kind === "bool" ? draft[it.key] !== it.value : String(draft[it.key] ?? "") !== String(it.value)
  );

  async function onSave() {
    setSaving(true);
    try {
      const patch: Record<string, number | boolean> = {};
      for (const it of items) {
        const v = draft[it.key];
        if (it.kind === "bool") {
          if (Boolean(v) !== it.value) patch[it.key] = Boolean(v);
        } else if (String(v) !== String(it.value)) {
          patch[it.key] = parseInt(String(v), 10);
        }
      }
      const r = await api.put<{ data: SettingItem[]; errors: string[] }>("/admin/settings", patch);
      setItems(r.data);
      setDraft(Object.fromEntries(r.data.map((x) => [x.key, x.kind === "bool" ? Boolean(x.value) : String(x.value)])));
      if (r.errors?.length) toast("error", `Bỏ qua: ${r.errors.join("; ")}`);
      else toast("success", "Đã lưu cấu hình runtime");
    } catch (err) {
      toast("error", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const clientConfig = `Base URL : ${baseUrl}/v1\nAPI Key  : sk-nex_<chia trong API Keys>\nModel    : <model trong Models>`;

  return (
    <div className="anim-page space-y-6">
      <PageHeader title="Settings" description="Thông tin instance, cấu hình runtime & nhật ký admin" />

      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : (
        <>
          <Card title="Thông tin instance">
            <dl className="grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase text-slate-500">Phiên bản</dt>
                <dd className="mt-1 font-medium">{health?.version}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Uptime</dt>
                <dd className="mt-1 font-medium">{formatUptime(health?.uptime ?? 0)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-slate-500">Database</dt>
                <dd className="mt-1 font-medium text-emerald-300">{health?.db}</dd>
              </div>
            </dl>
          </Card>

          <Card
            title="Cấu hình runtime (áp dụng ngay, không cần restart)"
            action={
              <div className="flex items-center gap-3">
                {dirty && <Badge tone="amber">Chưa lưu</Badge>}
                <Button onClick={onSave} disabled={saving || !dirty}>
                  {saving ? "Đang lưu..." : "Lưu thay đổi"}
                </Button>
              </div>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              {items.map((it) => {
                const overridden = it.overridden && String(it.value) !== String(it.default);
                return (
                  <div key={it.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor={it.key} className="text-sm font-medium text-slate-300">{it.label}</label>
                      {overridden
                        ? <Badge tone="green">đã override env</Badge>
                        : <span className="text-xs text-slate-500">mặc định: {String(it.default)}</span>}
                    </div>
                    {it.kind === "bool" ? (
                      <button
                        id={it.key}
                        role="switch"
                        aria-checked={Boolean(draft[it.key])}
                        onClick={() => setDraft((d) => ({ ...d, [it.key]: !d[it.key] }))}
                        className={`relative h-6 w-11 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 ${
                          draft[it.key] ? "bg-brand-500" : "bg-slate-700"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                            draft[it.key] ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    ) : (
                      <input
                        id={it.key}
                        type="number"
                        className={inputCls}
                        value={String(draft[it.key] ?? "")}
                        onChange={(e) => setDraft((d) => ({ ...d, [it.key]: e.target.value }))}
                      />
                    )}
                    <p className="text-xs text-slate-500">{it.hint}</p>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Cấu hình phía máy client (copy & dán vào coding agent)">
            <p className="mb-3 text-sm text-slate-400">
              Trong bất kỳ coding agent tương thích OpenAI, cấu hình Custom Provider như sau:
            </p>
            <pre className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 p-4 font-mono text-xs text-brand-200">
              {clientConfig}
            </pre>
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={() =>
                  navigator.clipboard.writeText(clientConfig).then(
                    () => toast("success", "Đã copy cấu hình!"),
                    () => toast("error", "Trình duyệt chặn clipboard")
                  )
                }
              >
                Copy cấu hình
              </Button>
            </div>
          </Card>

          <Card title="Nhật ký admin (50 dòng gần nhất)">
            {auditLoading ? (
              <TableSkeleton rows={4} cols={4} />
            ) : audit.length === 0 ? (
              <EmptyState
                title="Chưa có nhật ký"
                hint="Mọi thao tác tạo/xoá/sửa sẽ được ghi lại tại đây"
                icon={<ClipboardList size={18} aria-hidden />}
              />
            ) : (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="text-xs uppercase text-slate-500">
                      <th className="py-2 pr-4">Thời gian</th>
                      <th className="py-2 pr-4">Admin</th>
                      <th className="py-2 pr-4">Hành động</th>
                      <th className="py-2 pr-4">Đối tượng</th>
                      <th className="py-2">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {audit.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-800/40">
                        <td className="py-2 pr-4 text-xs text-slate-400 whitespace-nowrap">{formatDate(a.createdAt)}</td>
                        <td className="py-2 pr-4 text-xs">{a.username ?? "—"}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-brand-300">{a.action}</td>
                        <td className="py-2 pr-4 text-xs text-slate-300">{a.target ?? "—"}</td>
                        <td className="py-2 text-xs text-slate-500">{a.ip ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Mẹo vận hành">
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
              <li>Bind ở 127.0.0.1 và expose qua Cloudflare Tunnel / Tailscale (xem <code className="text-brand-300">plan/02-infrastructure.md</code>).</li>
              <li>Upstream API key được mã hoá AES-256-GCM bằng <code className="text-brand-300">DB_MASTER_KEY</code>.</li>
              <li>Thay đổi password admin: set <code className="text-brand-300">ADMIN_PASSWORD_HASH</code> mới trong <code className="text-brand-300">.env</code> rồi chạy lại seed.</li>
              <li>Cấu hình runtime ở trên lưu trong DB, ghi đè giá trị env — env chỉ còn là mặc định.</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "0m";
}
