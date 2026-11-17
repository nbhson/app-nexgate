import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type TodayStats, type TimeSeriesPoint, type UsageLog } from "../api/client";
import { Card, Spinner, Badge, Button, EmptyState } from "../components/ui";
import { errorMessage, formatUptime, formatDate } from "../lib/utils";

export function Overview() {
  const [today, setToday] = useState<TodayStats | null>(null);
  const [series, setSeries] = useState<TimeSeriesPoint[]>([]);
  const [recent, setRecent] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const now = Date.now();
    const from = now - 14 * 24 * 3600 * 1000;
    Promise.all([
      api.get<TodayStats>("/admin/usage/today").then((r) => setToday(r.data)),
      api.get<{ data: TimeSeriesPoint[] }>(`/admin/usage/timeseries?from=${from}&to=${now}`).then((r) => setSeries(r.data)),
      api.get<{ data: UsageLog[] }>("/admin/usage/logs?limit=6").then((r) => setRecent(r.data)),
    ])
      .then(() => setError(""))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const maxTokens = Math.max(...series.map((p) => p.totalTokens), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-slate-400">Tổng quan hoạt động gateway hôm nay</p>
        </div>
        <Link to="/keys">
          <Button>+ Tạo API key</Button>
        </Link>
      </div>

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-200">{error}</p>
      )}

      {loading && !today ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Requests hôm nay" value={(today?.requests ?? 0).toLocaleString()} />
            <Stat label="Tokens hôm nay" value={(today?.totalTokens ?? 0).toLocaleString()} />
            <Stat label="Input tokens" value={(today?.inputTokens ?? 0).toLocaleString()} />
            <Stat label="Output tokens" value={(today?.outputTokens ?? 0).toLocaleString()} />
          </div>

          <Card title="Requests & tokens — 14 ngày">
            {series.length === 0 ? (
              <EmptyState title="Chưa có dữ liệu usage" hint="Usage sẽ hiển thị sau khi có request đi qua gateway" />
            ) : (
              <div className="space-y-1">
                {series.map((p) => (
                  <div key={p.ts} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-xs text-slate-400">{p.ts.slice(5)}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800">
                      <div
                        className="h-full rounded bg-brand-500"
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

          <Card title="Hoạt động gần đây">
            {recent.length === 0 ? (
              <EmptyState title="Chưa có request nào" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Thời gian</th>
                    <th className="py-2 pr-4">Model</th>
                    <th className="py-2 pr-4">Tokens</th>
                    <th className="py-2 pr-4">Latency</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recent.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4 text-slate-300">{formatDate(log.createdAt)}</td>
                      <td className="py-2 pr-4">{log.modelId}</td>
                      <td className="py-2 pr-4 text-slate-400">{log.totalTokens}</td>
                      <td className="py-2 pr-4 text-slate-400">{log.latencyMs}ms</td>
                      <td className="py-2">
                        <Badge tone={log.statusCode < 400 ? "green" : log.statusCode < 500 ? "amber" : "red"}>
                          {log.statusCode}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
