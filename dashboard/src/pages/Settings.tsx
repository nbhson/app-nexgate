import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Card, Spinner, Button, Field, inputCls } from "../components/ui";
import { useToast } from "../components/Toast";
import { errorMessage } from "../lib/utils";

export function Settings() {
  const { toast } = useToast();
  const [health, setHealth] = useState<{ version: string; uptime: number; db: string } | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ status: string; version: string; db: string; uptime: number }>("/healthz")
      .then((r) => {
        setHealth({ version: r.version, uptime: r.uptime, db: r.db });
        setBaseUrl(window.location.origin);
      })
      .catch((err) => toast("error", errorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientConfig = `Base URL : ${baseUrl}/v1\nAPI Key  : sk-nex_<chia trong API Keys>\nModel    : <model trong Models>`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-400">Thông tin instance & cấu hình client</p>
      </div>

      {loading ? (
        <Spinner label="Đang tải..." />
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

          <Card title="Cấu hình phía máy client (copy & dán vào coding agent)">
            <p className="mb-3 text-sm text-slate-400">
              Trong bất kỳ coding agent tương thích OpenAI, cấu hình Custom Provider như sau:
            </p>
            <pre className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900 p-4 font-mono text-xs text-brand-200">
              {clientConfig}
            </pre>
            <div className="mt-3">
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(clientConfig).then(() => toast("success", "Đã copy cấu hình!"))}>
                Copy cấu hình
              </Button>
            </div>
          </Card>

          <Card title="Mẹo vận hành">
            <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
              <li>Bind ở 127.0.0.1 và expose qua Cloudflare Tunnel / Tailscale (xem <code className="text-brand-300">plan/02-infrastructure.md</code>).</li>
              <li>Upstream API key được mã hoá AES-256-GCM bằng <code className="text-brand-300">DB_MASTER_KEY</code>.</li>
              <li>Thay đổi password admin: set <code className="text-brand-300">ADMIN_PASSWORD_HASH</code> mới trong <code className="text-brand-300">.env</code> rồi chạy lại seed.</li>
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
