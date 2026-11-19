import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

const NAV = [
  { to: "/", label: "Overview", icon: "▦" },
  { to: "/providers", label: "Providers", icon: "◫" },
  { to: "/models", label: "Models", icon: "◉" },
  { to: "/keys", label: "API Keys", icon: "⚿" },
  { to: "/usage", label: "Usage", icon: "▤" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1" aria-label="Điều hướng chính">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              isActive
                ? "bg-brand-500/15 text-brand-300"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`
          }
        >
          <span className="w-4 text-center" aria-hidden>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);

  const logout = useCallback(async () => {
    await api.post("/admin/auth/logout");
    navigate("/login");
  }, [navigate]);

  // Đóng drawer khi chuyển route
  useEffect(() => setDrawer(false), [location.pathname]);

  const brand = (
    <div className="flex items-center gap-2 px-2">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 font-bold text-white" aria-hidden>N</span>
      <span className="text-lg font-semibold">NexGate</span>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden w-56 shrink-0 border-r border-slate-800 bg-slate-900/60 p-4 md:block">
        <div className="mb-6">{brand}</div>
        <NavLinks />
        <button
          onClick={logout}
          className="btn-press mt-8 w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Đăng xuất
        </button>
      </aside>

      {/* Mobile drawer + backdrop */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="anim-backdrop absolute inset-0 bg-slate-950/70" onClick={() => setDrawer(false)} aria-hidden />
          <aside
            className="anim-drawer absolute inset-y-0 left-0 w-64 border-r border-slate-800 bg-slate-900 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="mb-6 flex items-center justify-between">
              {brand}
              <button
                onClick={() => setDrawer(false)}
                aria-label="Đóng menu"
                className="btn-press rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <NavLinks onNavigate={() => setDrawer(false)} />
            <button
              onClick={logout}
              className="btn-press mt-8 w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Đăng xuất
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar — chỉ mobile */}
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-3 md:hidden">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Mở menu"
            className="btn-press rounded-md p-2 text-slate-300 hover:bg-slate-800"
          >
            ☰
          </button>
          <span className="text-sm font-semibold">NexGate</span>
          <span className="w-9" aria-hidden />
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
