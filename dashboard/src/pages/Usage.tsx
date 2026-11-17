import { useEffect, useState } from "react";
import { api, type UsageLog, type TimeSeriesPoint } from "../api/client";
import { Card, Spinner, Badge, EmptyState } from "../components/ui";
import { errorMessage, formatDate } from "../lib/utils";

type Range = "24h" | "7d" | "30d";

export function Usage() {
  const [range, setRange] = useState<Range>("7d");
  const [series, setSeries] = useState<TimeSeriesPoint[]>([]);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const now = Date.now();
    const ms = { "24h": 24 * 3600_000, "7d": 7 * 24 * 3600_000, "30d": 30 * 24 * 3600_000 }[range];
    const from = now - ms;
    const gran = range === "24h" ? "hour" : "day";
    Promise.all([
      api.get<{ data: TimeSeriesPoint[] }>(`/admin/usage/timeseries?from=${from}&to=${now}&granularity=${gran}`).then(
        (r) => setSeries(r.data)
      ),
      api.get<{ data: UsageLog[] }>(`/admin/usage/logs?limit=100`).then((r) => setLogs(r.data)),
    ])
      .then(() => setError(""))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [range]);

  const maxTokens = Math.max(...series.map((p) => p.totalTokens), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usage</h1>
          <p className="text-sm text-slate-400">Lượng token và request đi qua gateway</p>
        </div>
        <div className="flex gap-1 rounded-md border border-slate-700 p-1">
          {(["24h", "7d", "30d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded px-3 py-1 text-sm ${range === r ? "bg-brand-500 text-white" : "text-slate-400 hover:text-slate-200"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">{error}</p>}

      <Card title={`Requests & tokens — ${range}`}>
        {loading ? (
          <Spinner />
        ) : series.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu trong khoảng này" />
        ) : (
          <div className="space-y-1">
            {series.map((p) => (
              <div key={p.ts} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-slate-400">{p.ts.slice(5)}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-slate-800">
                  <div
                    className="flex h-full items-center rounded bg-brand-500/80"
                    style={{ width: `${(p.totalTokens / maxTokens) * 100}%` }}
                    title={`${p.requests} requests, ${p.totalTokens} tokens`}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-slate-400">{p.totalTokens.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Log gần đây">
        {loading ? (
          <Spinner />
        ) : logs.length === 0 ? (
          <EmptyState title="Chưa có log" />
        ) : (
          <div className="max-h-96 overflow-auto">
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
                  <tr key={l.id}>
                    <td className="py-2 pr-4 text-xs text-slate-400">{formatDate(l.createdAt)}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400">{l.apiKeyId.slice(0, 8)}</td>
                    <td className="py-2 pr-4">{l.modelId}</td>
                    <td className="py-2 pr-4 text-slate-400">
                      {l.inputTokens}/{l.outputTokens}
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
        )}
      </Card>
    </div>
  );
}
