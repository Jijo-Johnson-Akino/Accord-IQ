"use client";

import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { TONE_STYLES, type Tone } from "./tones";

export interface ToastInput {
  title: string;
  description?: string;
  tone?: Tone;
  /** Milliseconds before auto-dismiss. 0 keeps it until dismissed. Errors default to 0. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextValue {
  notify: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

const DEFAULT_DURATION = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id }]);
      const duration = input.duration ?? (input.tone === "error" ? 0 : DEFAULT_DURATION);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-2 p-4 sm:items-end"
      >
        {toasts.map((toast) => {
          const { container, icon, Icon } = TONE_STYLES[toast.tone ?? "info"];
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full gap-3 rounded-lg border p-4 shadow-lg sm:max-w-sm",
                container,
              )}
            >
              <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", icon)} />
              <div className="min-w-0 flex-1 text-small text-ink">
                <p className="font-semibold">{toast.title}</p>
                {toast.description && <p className="mt-1">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={`Dismiss notification: ${toast.title}`}
                className="-mt-1 -mr-1 h-fit rounded-md p-1 text-ink-muted hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
