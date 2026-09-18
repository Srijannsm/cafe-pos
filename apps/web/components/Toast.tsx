"use client";

import { useCallback, useRef, useState } from "react";
import { IconCheck, IconAlert } from "./icons";

type ToastTone = "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone };

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const toastHost = (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-toast-in pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
            t.tone === "success" ? "bg-stone-900 text-white" : "bg-danger text-white"
          }`}
        >
          {t.tone === "success" ? <IconCheck className="h-4 w-4 shrink-0" /> : <IconAlert className="h-4 w-4 shrink-0" />}
          {t.message}
        </div>
      ))}
    </div>
  );

  return { showToast, toastHost };
}
