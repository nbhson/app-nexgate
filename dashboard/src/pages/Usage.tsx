import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import {
  api,
  type ApiKeyRecord, type Model, type ModelUsageStats, type TimeSeriesPoint, type UsageLog,
} from "../api/client";
import {
  Card, Badge, EmptyState, inputCls, Button, TableSkeleton, PageHeader,
  RefreshControls, SyncErrorBanner,
} from "../components/ui";
import { usePolling } from "../hooks/usePolling";
import { formatDate } from "../lib/utils";

type Range = "24h" | "7d" | "30d";
const RANGE_MS: Record<Range, number> = { "24h": 24 * 3600_000, "7d": 7 * 24 * 3600_000, "30d": 30 * 24 * 3600_000 };
const PAGE = 50;
const POLL_MS = 20_000;

export function Usage() {
  const [range, setRange] = useState<Range>("7d");
  const [series, setSeries] = useState<TimeSeriesPoint[]>([]);
  const [byModel, setByModel] = useState<ModelUsageStats[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [fKey, setFKey] = useState("");
  const [fModel, setFModel] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const seqRef = useRef(0);

  useEffect(() => {
    api.get<{ data: ApiKeyRecord[] }>("/admin/keys").then((r) => setKeys(r.data)).catch(() => {});
    api.get<{ data: Model[] }>("/admin/models").then((r) => setModels(r.data)).catch(() => {});
  }, []);

  const { refreshing, lastUpdated, error, failCount, refresh } = usePolling(
    async ({ background }) => {
      const seq = ++seqRef.current;
      const now = Date.now();
      const from = now - RANGE_MS[range];
      const gran = range === "24h" ? "hour" : "day";
      const params = new URLSearchParams({ from: String(from), to: String(now), granularity: gran });
      if (fKey) params.set("keyId", fKey);
      if (fModel) params.set("modelId", fModel);

      const logParams = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
      if (fKey) logParams.set("keyId", fKey);
      if (fModel) logParams.set("modelId", fModel);
      if (fStatus) logParams.set("status", fStatus);

      try {
        const [ts, bm, lg] = await Promise.all([
          api.get<{ data: TimeSeriesPoint[] }>(`/admin/usage/timeseries?${params}`),
          api.get<{ data: ModelUsageStats[] }>(`/admin/usage/models?${params}`),
          api.get<{ data: UsageLog[]; total: number }>(`/admin/usage/logs?${logParams}`),
        ]);
        if (seq !== seqRef.current) return;
        setSeries(ts.data);
        setByModel(bm.data);
        setLogs(lg.data);
        setLogTotal(lg.total ?? lg.data.length);
      } finally {
        if (seq === seqRef.current && !background) setLoading(false);
      }
    },
    POLL_MS,
    [range, fKey, fModel, fStatus, page]
  );

  const keyName = useMemo(() => {
    const m = new Map(keys.map((k) => [k.id, k.name]));
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [keys]);

  const maxTokens = Math.max(...series.map((p) => p.totalTokens), 1);
  const totalCost = byModel.reduce((s, m) => s + (m.costUsd ?? 0), 0);
  const fmtCost = (usd: number | null) => (usd == null ? "—" : `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`);

  return (
    <div className="anim-page space-y-6">
      <PageHeader title="Usage" description="Lượng token, request và chi phí đi qua gateway">
        <RefreshControls refreshing={refreshing} lastUpdated={lastUpdated} onRefresh={refresh} />
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-1" role="group" aria-label="Khoảng thời gian">
          {(["24h", "7d", "30d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); setPage(0); }}
              aria-pressed={range === r}
              className={`btn-press rounded-md px-3 py-1 text-sm transition-colors ${
                range === r ? "bg-brand-600 font-medium text-white shadow-card" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </PageHeader>

      <SyncErrorBanner error={error} failCount={failCount} intervalMs={POLL_MS} onRetry={refresh} />

      {/* Bộ lọc */}
      <div className="grid gap-3 sm:grid-cols-3">
        <select
          className={inputCls} value={fKey}
          onChange={(e) => { setFKey(e.target.value); setPage(0); }}
          aria-label="Lọc theo key"
        >
          <option value="">Mọi API key</option>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
        <select
          className={inputCls} value={fModel}
          onChange={(e) => { setFModel(e.target.value); setPage(0); }}
          aria-label="Lọc theo model"
        >
          <option value="">Mọi model</option>
          {models.map((m) => (
            <option key={m.exposedId} value={m.exposedId}>{m.exposedId}</option>
          ))}
        </select>
        <select
          className={inputCls} value={fStatus}
          onChange={(e) => { setFStatus(e.target.value); setPage(0); }}
          aria-label="Lọc theo status"
        >
          <option value="">Mọi status</option>
          <option value="2xx">2xx — thành công</option>
          <option value="4xx">4xx — lỗi client</option>
          <option value="5xx">5xx — lỗi upstream</option>
        </select>
      </div>

      {/* Breakdown theo model */}
      <Card
        title={`Theo model — ${range}`}
        action={totalCost > 0 && <span className="text-xs text-brand-300">≈ ${totalCost.toFixed(4)} tổng chi phí</span>}
      >
        {loading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : byModel.length === 0 ? (
          <EmptyState
            title="Chưa có request nào khớp bộ lọc"
            hint="Sau khi client gọi (kể cả streaming), usage sẽ hiển thị ở đây"
            icon={<Activity size={18} aria-hidden />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Model</th>
                  <th className="py-2 pr-4">Requests</th>
                  <th className="py-2 pr-4">In / Ra</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2">Chi phí</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {byModel.map((m) => (
                  <tr key={m.modelId + m.providerId} className="hover:bg-slate-800/40">
                    <td className="py-2.5 pr-4 font-mono text-xs">{m.modelId}</td>
                    <td className="py-2.5 pr-4">{m.requests.toLocaleString()}</td>
                    <td className="py-2.5 pr-4 text-slate-400">
                      {m.inputTokens.toLocaleString()} / {m.outputTokens.toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{m.totalTokens.toLocaleString()}</td>
                    <td className="py-2.5 text-slate-300">{fmtCost(m.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Requests & tokens — ${range}`}>
        {loading ? (
          <TableSkeleton rows={6} cols={2} />
        ) : series.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu trong khoảng này" />
        ) : (
          <div className="space-y-1">
            {series.map((p) => (
              <div key={p.ts} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-slate-400">{p.ts.slice(5)}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className="anim-bar flex h-full items-center rounded bg-brand-500/80"
                    style={{ width: `${(p.totalTokens / maxTokens) * 100}%` }}
                    title={`${p.requests} requests, ${p.totalTokens} tokens`}
                  />
                </div>
                <span className="w-20 shrink-0 text-right text-xs text-slate-400">{p.totalTokens.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Log gần đây (${logTotal})`}>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : logs.length === 0 ? (
          <EmptyState title="Chưa có log" />
        ) : (
          <>
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Thời gian</th>
                    <th className="py-2 pr-4">Key</th>
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">In/Out</th>
                    <th className="py-2 pr-4">Latency</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-800/40">
                      <td className="py-2 pr-4 text-xs text-slate-400 whitespace-nowrap">{formatDate(l.createdAt)}</td>
                      <td className="py-2 pr-4 text-xs text-slate-300">{keyName(l.apiKeyId)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{l.modelId}</td>
                      <td className="py-2 pr-4 text-slate-400">
                        {l.inputTokens}/{l.outputTokens}
                        {l.errorCode === "usage_estimated" && (
                          <span
                            className="ml-1 text-[10px] text-slate-500"
                            title="Upstream không trả usage — số liệu ước lượng theo ký tự"
                          >
                            ≈ est
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-400">{l.latencyMs}ms</td>
                      <td className="py-2">
                        <Badge tone={l.statusCode < 400 ? "green" : l.statusCode < 500 ? "amber" : "red"}>
                          {l.statusCode}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Trang {page + 1} / {Math.max(1, Math.ceil(logTotal / PAGE))}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={14} aria-hidden /> Trước
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={(page + 1) * PAGE >= logTotal}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau <ChevronRight size={14} aria-hidden />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
