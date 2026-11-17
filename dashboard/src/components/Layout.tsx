import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useCallback } from "react";
import { api } from "../api/client";

const NAV = [
  { to: "/", label: "Overview", icon: "▦" },
  { to: "/providers", label: "Providers", icon: "◫" },
  { to: "/models", label: "Models", icon: "◉" },
  { to: "/keys", label: "API Keys", icon: "⚿" },
  { to: "/usage", label: "Usage", icon: "▤" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

export function Layout() {
  const navigate = useNavigate();

  const logout = useCallback(async () => {
    await api.post("/admin/auth/logout");
    navigate("/login");
  }, [navigate]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-bold text-white">N</span>
          <span className="text-lg font-semibold">NexGate</span>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-brand-500/15 text-brand-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`
              }
            >
              <span className="w-4 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="mt-8 w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Đăng xuất
        </button>
      </aside>

      <main className="flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
