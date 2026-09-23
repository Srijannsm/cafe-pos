"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconX } from "../icons";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
};

const SIZE_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-[400px]",
  md: "max-w-[520px]",
  lg: "max-w-[640px]",
};

/**
 * Base modal: overlay + centered panel, closable by Escape, backdrop
 * click, or the X button, with a small focus trap so Tab can't escape
 * the panel while it's open. Everything else that needs a dialog
 * (the QR display, ConfirmDialog) builds on top of this instead of
 * each one wiring up its own overlay/escape-key/focus-trap logic.
 */
export function Modal({ open, onClose, title, size = "md", children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      // Indexing a NodeList is typed as possibly undefined under
      // noUncheckedIndexedAccess, so this doubles as both the "nothing
      // focusable" guard and the type narrowing .focus() needs below.
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    // Focus the panel itself on open so Escape/Tab work immediately,
    // without guessing which inner element should get focus first.
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-overlay-backdrop p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`animate-pop w-full ${SIZE_CLASS[size]} rounded-xl bg-surface-raised p-6 shadow-lg outline-none`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="heading-md text-ink-primary">{title}</h2>}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-faint transition hover:bg-surface-sunken hover:text-ink-primary"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
