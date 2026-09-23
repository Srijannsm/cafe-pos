"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconAlert, IconInfo } from "./icons";

type ToastTone = "success" | "error" | "warning" | "info";
type ToastItem = { id: number; message: string; tone: ToastTone };

const TONE_STYLES: Record<ToastTone, string> = {
  success: "bg-ink-primary text-surface-canvas",
  error: "bg-status-danger text-on-brand",
  warning: "bg-status-warning text-status-warning-ink",
  info: "bg-status-info text-status-info-ink",
};

const TONE_ICONS: Record<ToastTone, typeof IconCheck> = {
  success: IconCheck,
  error: IconAlert,
  warning: IconAlert,
  info: IconInfo,
};

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const toastContainer = (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = TONE_ICONS[t.tone];
        return (
          <div
            key={t.id}
            className={`animate-toast-in pointer-events-auto flex items-center gap-2 rounded-md px-4 py-3 text-sm font-semibold shadow-lg ${TONE_STYLES[t.tone]}`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {t.message}
          </div>
        );
      })}
    </div>
  );

  // Portal renders toasts at document.body so they're never a child of
  // whatever layout element uses toastHost — avoids removeChild crashes
  // caused by browser extensions or fixed-position DOM reconciliation.
  const toastHost = mounted ? createPortal(toastContainer, document.body) : null;

  return { showToast, toastHost };
}
