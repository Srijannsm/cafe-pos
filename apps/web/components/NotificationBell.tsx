"use client";

import { useEffect, useRef, useState } from "react";
import { useOrdersSocket } from "../lib/useOrdersSocket";
import { IconBell, IconCheck, IconClock } from "./icons";

type Notification = {
  id: string;
  kind: "order_sent" | "item_ready";
  message: string;
  at: Date;
  read: boolean;
};

let _notifId = 0;
function nextId() { return `n${++_notifId}`; }

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function NotificationBell({ authReady }: { authReady: boolean }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Update "time ago" labels every 30 seconds
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function push(kind: Notification["kind"], message: string) {
    setNotifications((prev) => [
      { id: nextId(), kind, message, at: new Date(), read: false },
      ...prev.slice(0, 49), // keep max 50
    ]);
  }

  useOrdersSocket(authReady, {
    onSentToKitchen: (payload) => push("order_sent", `Order #${payload.orderId} sent to kitchen`),
    onItemReady: (payload) => push("item_ready", `Item ready on order #${payload.orderId}`),
  });

  const unread = notifications.filter((n) => !n.read).length;

  function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function clearAll() {
    setNotifications([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllRead();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-secondary transition hover:bg-surface-sunken hover:text-ink-primary"
      >
        <IconBell />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-status-danger text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-border-subtle bg-surface-raised shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <span className="label-md font-semibold text-ink-primary">Notifications</span>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="label-sm text-ink-faint hover:text-ink-secondary transition"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <IconBell className="h-6 w-6 text-ink-faint" />
                <p className="body-sm text-ink-faint">No notifications yet</p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className="flex items-start gap-3 border-b border-border-subtle px-4 py-3 last:border-0 hover:bg-surface-sunken transition"
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        n.kind === "item_ready"
                          ? "bg-status-success-tint text-status-success-ink"
                          : "bg-status-info-tint text-status-info-ink"
                      }`}
                    >
                      {n.kind === "item_ready" ? (
                        <IconCheck className="h-3.5 w-3.5" />
                      ) : (
                        <IconClock className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="body-sm text-ink-primary">{n.message}</p>
                      <p className="label-sm text-ink-faint">{timeAgo(n.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
