import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Activity,
  Boxes,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Menu,
  Server,
  Settings2,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "../api/client";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** IA điều hướng — DOM order = visual order (responsive-layout a11y). */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Giám sát",
    items: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/usage", label: "Usage", icon: Activity },
    ],
  },
  {
    label: "Cấu hình",
    items: [
      { to: "/providers", label: "Providers", icon: Server },
      { to: "/models", label: "Models", icon: Boxes },
      { to: "/keys", label: "API Keys", icon: KeyRound },
    ],
  },
  {
    label: "Hệ thống",
    items: [{ to: "/settings", label: "Settings", icon: Settings2 }],
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white shadow-card" aria-hidden>
        <ShieldCheck size={18} />
      </span>
      <div className="leading-tight">
        <p className="text-[15px] font-semibold tracking-tight text-slate-100">NexGate</p>
        <p className="text-[11px] text-slate-500">Gateway Console</p>
      </div>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Điều hướng chính">
      {NAV_GROUPS.map((group, gi) => (
        <div key={group.label} className={gi > 0 ? "mt-6" : undefined}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `btn-press relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ` +
                    (isActive
                      ? "bg-brand-500/12 font-medium text-brand-300"
                      : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* active indicator — không chỉ dựa màu sắc */}
                      {isActive && (
                        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-400" aria-hidden />
                      )}
                      <item.icon size={16} strokeWidth={isActive ? 2 : 1.75} aria-hidden />
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

async function logout() {
  try {
    await api.post("/admin/auth/logout");
  } finally {
    window.location.href = "/login";
  }
}

export function Layout() {
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);

  // Đóng drawer khi đổi route
  useEffect(() => setDrawer(false), [location.pathname]);

  const logoutButton = (
    <button
      onClick={logout}
      className="btn-press mt-6 flex w-full items-center gap-3 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
    >
      <LogOut size={16} aria-hidden />
      Đăng xuất
    </button>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop (composition: sidebar 256px + fluid main) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900/50 px-3 py-5 md:flex">
        <div className="px-2 pb-2">
          <Brand />
        </div>
        <div className="mt-4 flex-1">
          <NavLinks />
        </div>
        {logoutButton}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="anim-backdrop absolute inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={() => setDrawer(false)} aria-hidden />
          <aside
            className="anim-drawer absolute inset-y-0 left-0 flex w-72 flex-col border-r border-slate-800 bg-slate-900 px-3 py-5"
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng"
          >
            <div className="flex items-center justify-between px-2 pb-2">
              <Brand />
              <button
                onClick={() => setDrawer(false)}
                aria-label="Đóng menu"
                className="btn-press rounded-md p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawer(false)} />
            </div>
            {logoutButton}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar — mobile only, sticky */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur md:hidden">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Mở menu"
            className="btn-press -ml-1 rounded-lg p-2 text-slate-300 hover:bg-slate-800"
          >
            <Menu size={20} aria-hidden />
          </button>
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={15} className="text-brand-400" aria-hidden />
            NexGate
          </span>
          <span className="w-9" aria-hidden />
        </header>

        {/* Main — giới hạn chiều rộng đọc, canh giữa trên màn lớn */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
