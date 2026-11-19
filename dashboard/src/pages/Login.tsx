import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { api } from "../api/client";
import { Button, Field, inputCls } from "../components/ui";
import { errorMessage } from "../lib/utils";

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post<{ ok: boolean }>("/admin/auth/login", { username, password });
      navigate("/");
    } catch (err) {
      setError(errorMessage(err, "Đăng nhập thất bại"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="anim-page w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-pop" aria-hidden>
            <ShieldCheck size={22} />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">NexGate Admin</h1>
          <p className="mt-1 text-sm text-slate-400">Đăng nhập để quản trị gateway</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-pop"
        >
          <Field label="Tên đăng nhập" required>
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </Field>
          <Field label="Mật khẩu" required>
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/35 bg-red-500/12 px-3 py-2.5 text-sm text-red-300"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-600">
          Khu vực quản trị — mọi phiên đăng nhập được ghi vào audit log.
        </p>
      </div>
    </div>
  );
}
