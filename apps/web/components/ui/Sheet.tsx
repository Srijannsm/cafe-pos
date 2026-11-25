"use client";

import { useEffect, type ReactNode } from "react";
import { IconX } from "../icons";

// Bottom sheet on phones (thumb zone), centred dialog on bigger screens.
export function Sheet({ open, onClose, title, children, footer, tall }: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="animate-fade-in absolute inset-0 bg-overlay-backdrop" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex w-full flex-col overflow-hidden rounded-t-3xl bg-surface-raised shadow-lg sm:max-w-lg sm:rounded-3xl ${tall ? "h-[92vh] sm:h-[85vh]" : "max-h-[92vh]"}`}
        style={{ animation: "sheet-up 220ms cubic-bezier(.2,.8,.2,1)" }}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />
        {title && (
          <div className="flex items-center gap-3 px-5 pb-2 pt-3">
            <div className="min-w-0 flex-1 text-lg font-semibold text-ink-primary">{title}</div>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-ink-faint hover:bg-surface-sunken"><IconX className="h-5 w-5" /></button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-border-subtle p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20, size = "md" }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: "sm" | "md" }) {
  const btn = size === "sm" ? "h-8 w-8 text-base" : "h-11 w-11 text-xl";
  return (
    <div className="inline-flex items-center rounded-full border border-border-strong bg-surface-raised">
      <button type="button" aria-label="Less" disabled={value <= min} onClick={() => onChange(value - 1)} className={`${btn} rounded-full font-medium text-ink-primary disabled:text-ink-faint`}>−</button>
      <span className={`tabular min-w-8 text-center font-semibold ${size === "sm" ? "text-sm" : "text-base"}`}>{value}</span>
      <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(value + 1)} className={`${btn} rounded-full font-medium text-ink-primary disabled:text-ink-faint`}>+</button>
    </div>
  );
}
