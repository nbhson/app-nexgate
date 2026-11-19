import { createContext, useContext, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

const ToastCtx = createContext<{
  toast: (type: "success" | "error", message: string) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: "success" | "error", message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-96"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`anim-toast pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-pop backdrop-blur ${
              t.type === "error"
                ? "border-red-500/40 bg-red-950/90 text-red-200"
                : "border-emerald-500/35 bg-emerald-950/90 text-emerald-200"
            }`}
          >
            {t.type === "error" ? (
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-300" aria-hidden />
            ) : (
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden />
            )}
            <span className="min-w-0 flex-1 leading-snug">{t.message}</span>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              aria-label="Đóng thông báo"
              className="btn-press -mr-1 -mt-1 shrink-0 rounded p-1 opacity-60 hover:opacity-100"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
