import { createContext, useContext, useState, useCallback } from "react";

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
      <div className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.type === "error"
                ? "border-red-700 bg-red-950 text-red-200"
                : "border-emerald-700 bg-emerald-950 text-emerald-200"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
