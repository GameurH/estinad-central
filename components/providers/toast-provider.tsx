"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

interface Toast {
  id: number;
  title: string;
  variant: "success" | "error" | "info";
}

const ToastContext = createContext<{ toast: (title: string, variant?: Toast["variant"]) => void }>({
  toast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((title: string, variant: Toast["variant"] = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, title, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-scale-in pointer-events-auto flex items-center gap-2.5 rounded-[var(--radius-md)] border border-border bg-bg-secondary px-3.5 py-3 shadow-xl"
          >
            {t.variant === "success" && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
            {t.variant === "error" && <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />}
            {t.variant === "info" && <Info className="h-4 w-4 shrink-0 text-info" />}
            <p className="text-[13px] font-medium text-text-primary">{t.title}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
