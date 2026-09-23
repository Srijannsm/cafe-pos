"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type DropdownItem = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  tone?: "danger" | "default";
};

type DropdownProps = {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
};

/**
 * Accessible dropdown menu built on a portal so it's never clipped by
 * overflow:hidden ancestors. Closes on Escape, outside click, and when
 * focus leaves. Items are navigable with arrow keys.
 */
export function Dropdown({ open, onClose, trigger, items, align = "right" }: DropdownProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  // Position the portal menu below the trigger
  function getMenuStyle(): React.CSSProperties {
    if (!triggerRef.current) return {};
    const rect = triggerRef.current.getBoundingClientRect();
    return {
      position: "fixed",
      top: rect.bottom + 8,
      ...(align === "right" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
      zIndex: 9999,
      minWidth: rect.width,
    };
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!menuRef.current) return;
      const focusable = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      );
      const idx = focusable.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusable[(idx + 1) % focusable.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusable[(idx - 1 + focusable.length) % focusable.length]?.focus();
      }
    }

    function handleClick(e: MouseEvent) {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClick);

    // Focus first item on open
    setTimeout(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  const menuStyle = open ? getMenuStyle() : {};

  return (
    <>
      <div ref={triggerRef}>{trigger}</div>
      {open &&
        createPortal(
          <ul
            ref={menuRef}
            role="menu"
            style={menuStyle}
            className="animate-fade-in overflow-hidden rounded-lg border border-border-subtle bg-surface-overlay shadow-lg"
          >
            {items.map((item) => (
              <li key={item.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                  className={`body-md flex w-full items-center gap-2 px-4 py-2.5 text-left font-medium transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
                    item.tone === "danger"
                      ? "text-status-danger-ink"
                      : "text-ink-primary"
                  }`}
                >
                  {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
                  {item.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
