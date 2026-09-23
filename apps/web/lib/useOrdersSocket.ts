"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type OrderSentToKitchenEvent = { orderId: number };
export type OrderItemReadyEvent = { orderId: number; orderItemId: number };

type Handlers = {
  onSentToKitchen?: (payload: OrderSentToKitchenEvent) => void;
  onItemReady?: (payload: OrderItemReadyEvent) => void;
};

// Thin wrapper around the orders WebSocket gateway. Handlers are kept in a
// ref so the effect only needs to (re)connect when `ready` flips -- passing
// a fresh arrow function as a handler on every render (the normal case for
// a page component) never tears the socket down and reconnects it.
//
// This is additive, not a replacement for polling: if the socket drops
// (network blip, server restart) a page's existing setInterval poll still
// catches up within its normal interval, so there's no hard dependency on
// the connection staying alive.
//
// Returns `connected` so callers can show a reconnection banner when the
// socket is down. The poll is the fallback, but surfacing the drop gives
// kitchen staff early warning before missing an order.
export function useOrdersSocket(ready: boolean, handlers: Handlers): { connected: boolean } {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!ready) return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const socket: Socket = io(API_URL, { auth: { token } });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on("order.sentToKitchen", (payload: OrderSentToKitchenEvent) => {
      handlersRef.current.onSentToKitchen?.(payload);
    });
    socket.on("order.itemReady", (payload: OrderItemReadyEvent) => {
      handlersRef.current.onItemReady?.(payload);
    });

    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, [ready]);

  return { connected };
}
