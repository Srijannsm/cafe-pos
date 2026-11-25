"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/api\/?$/, "");

type Handlers = Partial<Record<string, (payload: any) => void>>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Subscribe to any cafe-room events (floor.changed, table.request,
// qr.orderPlaced, order.itemVoided, menu.changed ...). Handlers live in a
// ref so passing new arrow functions each render never reconnects.
// Pages still keep a slow fallback poll -- the socket makes them instant,
// the poll makes them safe if Wi-Fi blips.
export function useCafeSocket(ready: boolean, handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    if (!ready) return;
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    const socket: Socket = io(SOCKET_URL, { auth: { token }, reconnectionDelayMax: 8000 });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.onAny((event: string, payload: unknown) => ref.current[event]?.(payload));
    return () => {
      socket.disconnect();
    };
  }, [ready]);

  return { connected };
}

/** Short beep via WebAudio -- no audio file to ship or fail to load. */
export function chime(times = 2) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = i % 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.17);
    }
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // audio blocked until the user interacts -- fine
  }
}
