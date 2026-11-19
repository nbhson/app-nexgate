import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Design system primitives — enterprise dark.
 * Color: chỉ dùng alias/ramp đã thiết kế trong tailwind.config.ts
 * (semantic badge theo recipe bg+border+text; destructive theo contract
 * danger-filled + white; focus ring brand-400).
 */

export function Spinner({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-400">
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label}
    </div>
  );
}

/** Skeleton block — dùng khi chờ > 300ms (loading-states). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton h-4 w-full ${className}`} aria-hidden />;
}

/** Skeleton thay cho Spinner trong table — giữ nguyên layout, giảm CLS. */
export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 py-2" role="status" aria-label="Đang tải">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={j === 0 ? "w-1/4" : "flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── PageHeader — composition "page head": title + description + action
   cluster. Mọi trang dùng chung một khuôn để tạo phân cấp nhất quán. ── */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  action,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/70 shadow-card">
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ── Button ─────────────────────────────────────────────────────────────────
   primary: brand-filled (contract white ≥4.5:1) · secondary: surface outlined
   ghost: không viền cho hành động phụ trong table · danger: filled red —
   cùng một ramp cho trigger → confirm → error (destructive contract). */
export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  const base =
    "btn-press inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  const styles = {
    primary: "border-brand-700/60 bg-brand-600 text-white hover:bg-brand-500",
    secondary: "border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-800 hover:text-slate-100",
    danger: "border-red-700/60 bg-red-700 text-white hover:bg-red-600",
    ghost: "border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-100",
  };
  return (
    <button className={`${base} ${sizes[size]} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

/* ── Badge — semantic status, 3 lớp bg+border+text (không dùng màu đơn độc:
   luôn kèm label chữ, CVD-safe). */
export function Badge({
  tone = "slate",
  children,
}: {
  tone?: "green" | "red" | "amber" | "slate" | "brand";
  children: ReactNode;
}) {
  const tones = {
    green: "border-emerald-500/30 bg-emerald-500/12 text-emerald-300",
    red: "border-red-500/35 bg-red-500/12 text-red-300",
    amber: "border-amber-500/30 bg-amber-500/12 text-amber-300",
    slate: "border-slate-500/30 bg-slate-500/12 text-slate-300",
    brand: "border-brand-500/35 bg-brand-500/12 text-brand-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-300">
        {label}
        {required && <span className="ml-1 text-red-400" aria-hidden>*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 " +
  "placeholder:text-slate-600 transition-[border-color,box-shadow] " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 px-6 py-10 text-center">
      {icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-full border border-slate-800 bg-slate-900 text-slate-500">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Thanh tiến độ quota — tone đổi theo mức dùng; số % luôn hiển thị (CVD-safe). */
export function ProgressBar({ value, max, tone }: { value: number; max: number; tone?: "auto" | "brand" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = tone === "brand" || pct < 70 ? "bg-brand-500" : pct < 90 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`anim-bar h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-slate-400">{pct}%</span>
    </div>
  );
}

// ── Modal (entrance + focus trap + a11y) — surface "raised" ────────────────
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(
      "input, select, textarea, button, [tabindex]:not([tabindex='-1'])"
    );
    (first ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && panel) {
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(
            "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])"
          )
        ).filter((el) => !el.hasAttribute("disabled"));
        if (focusables.length === 0) return;
        const firstEl = focusables[0];
        const lastEl = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="anim-backdrop fixed inset-0 bg-slate-950/75 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`anim-modal relative w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-slate-700 bg-surface-raised shadow-pop outline-none`}
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <h2 className="truncate text-sm font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="btn-press -mr-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

// ── useConfirm — thay window.confirm(); cùng danger ramp end-to-end ────────
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = (opts: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOptions(opts);
    });

  const settle = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = options ? (
    <Modal title={options.title} onClose={() => settle(false)}>
      <p className="text-sm leading-relaxed text-slate-300">{options.message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => settle(false)}>
          Huỷ
        </Button>
        <Button variant={options.danger ? "danger" : "primary"} autoFocus onClick={() => settle(true)}>
          {options.confirmLabel ?? "Xác nhận"}
        </Button>
      </div>
    </Modal>
  ) : null;

  return { confirm, dialog };
}
