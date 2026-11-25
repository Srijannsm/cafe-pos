"use client";

import { useEffect, type ReactNode } from "react";
import { IconX } from "../icons";

// Right-side panel for editing a record without losing the list behind it
// (the pattern Square/Toast back offices use for item editing).
export function Drawer({
  open, onClose, title, subtitle, children, footer, width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
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
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Close" className="animate-fade-in absolute inset-0 bg-overlay-backdrop" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={`animate-slide-in-right relative flex h-full w-full ${width} flex-col bg-surface-raised shadow-lg`}>
        <div className="flex items-start gap-3 border-b border-border-subtle px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-ink-primary">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-secondary">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-ink-faint transition hover:bg-surface-sunken hover:text-ink-primary">
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-3 border-t border-border-subtle px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
