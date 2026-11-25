"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/api\/?$/, "");
const REACTIONS = ["👏", "😂", "😮", "🔥", "🤝"];

type Lobby = { id: string; mode: "table" | "open"; host: string; avatar: string; sameTable: boolean }[];
type State = {
  id: string; mode: "table" | "open"; board: (null | "X" | "O")[]; turn: "X" | "O"; winner: null | "X" | "O" | "draw";
  line: number[] | null; score: { X: number; O: number; draw: number };
  players: { X: { table: string; avatar: string } | null; O: { table: string; avatar: string } | null }; you: "X" | "O";
};

// Tic-tac-toe over the cafe's game socket. No names, no chat -- you are
// "Table 5 🦊" and can only send the five emoji reactions.
export function TableGame({ qrToken, t }: { qrToken: string; t: (k: string) => string }) {
  const sock = useRef<Socket | null>(null);
  const [me, setMe] = useState<{ avatar: string; tableNumber: string } | null>(null);
  const [lobby, setLobby] = useState<Lobby>([]);
  const [game, setGame] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [reaction, setReaction] = useState<{ emoji: string; mine: boolean } | null>(null);
  const [ended, setEnded] = useState("");

  useEffect(() => {
    const s = io(`${SOCKET_URL}/games`, { auth: { qrToken } });
    sock.current = s;
    s.on("games.hello", setMe);
    s.on("games.lobby", setLobby);
    s.on("games.state", (st: State) => { setGame(st); setEnded(""); });
    s.on("games.error", (e: { message: string }) => setError(e.message));
    s.on("games.ended", (e: { reason: string }) => { setGame(null); setEnded(e.reason); });
    s.on("games.reaction", (r: { from: "X" | "O"; emoji: string }) => {
      setReaction({ emoji: r.emoji, mine: false });
      setTimeout(() => setReaction(null), 1800);
    });
    s.on("connect_error", () => setError(t("gameOffline")));
    return () => { s.disconnect(); };
  }, [qrToken, t]);

  const emit = (e: string, p?: unknown) => sock.current?.emit(e, p);

  if (error && !me) return <p className="p-6 text-center text-sm text-ink-secondary">{error}</p>;

  if (!game) {
    const waitingMine = lobby.find((l) => l.sameTable && l.avatar === me?.avatar);
    return (
      <div className="space-y-5 p-5">
        {ended && <p className="rounded-xl bg-surface-sunken px-4 py-2.5 text-center text-sm">{ended}</p>}
        <div className="text-center">
          <p className="text-5xl">{me?.avatar ?? "🎲"}</p>
          <p className="mt-2 text-sm text-ink-secondary">{t("youAre")} {me ? `Table ${me.tableNumber}` : "…"}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => emit("games.host", { mode: "table" })} className="rounded-2xl border border-border-subtle bg-surface-raised p-4 text-left active:scale-[0.98]">
            <p className="text-2xl">🪑</p>
            <p className="mt-2 text-sm font-semibold">{t("playTable")}</p>
            <p className="text-xs text-ink-faint">{t("playTableHint")}</p>
          </button>
          <button type="button" onClick={() => emit("games.host", { mode: "open" })} className="rounded-2xl border border-border-subtle bg-surface-raised p-4 text-left active:scale-[0.98]">
            <p className="text-2xl">⚔️</p>
            <p className="mt-2 text-sm font-semibold">{t("challenge")}</p>
            <p className="text-xs text-ink-faint">{t("challengeHint")}</p>
          </button>
        </div>
        {waitingMine && <p className="text-center text-sm text-ink-secondary">{t("waiting")}</p>}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">{t("openGames")}</p>
          {lobby.filter((l) => l.avatar !== me?.avatar || !l.sameTable).length === 0 ? (
            <p className="text-sm text-ink-faint">{t("noGames")}</p>
          ) : (
            <ul className="space-y-2">
              {lobby.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => emit("games.join", { roomId: l.id })} className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 text-left active:scale-[0.99]">
                    <span className="text-2xl">{l.avatar}</span>
                    <span className="flex-1 text-sm font-medium">{l.host}{l.sameTable ? ` · ${t("yourTable")}` : ""}</span>
                    <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-on-brand">{t("join")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-center text-[11px] text-ink-faint">{t("gameRules")}</p>
      </div>
    );
  }

  const opp = game.you === "X" ? game.players.O : game.players.X;
  const mine = game.you === "X" ? game.players.X : game.players.O;
  const myTurn = !game.winner && game.players.O && game.turn === game.you;
  const status = !game.players.O
    ? t("waitingOpponent")
    : game.winner === "draw" ? t("draw")
    : game.winner ? (game.winner === game.you ? t("youWin") : t("youLose"))
    : myTurn ? t("yourTurn") : t("theirTurn");

  return (
    <div className="relative space-y-4 p-5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-semibold">{mine?.avatar} {t("you")} <span className="tabular text-ink-faint">{game.score[game.you]}</span></span>
        <span className="tabular text-xs text-ink-faint">{game.score.draw} {t("draws")}</span>
        <span className="flex items-center gap-1.5 font-semibold"><span className="tabular text-ink-faint">{game.score[game.you === "X" ? "O" : "X"]}</span> {opp ? `T${opp.table}` : "…"} {opp?.avatar ?? "⏳"}</span>
      </div>
      <p className={`rounded-xl py-2 text-center text-sm font-semibold ${myTurn ? "bg-brand text-on-brand" : game.winner === game.you ? "bg-status-success-tint text-status-success-ink" : "bg-surface-sunken text-ink-secondary"}`}>{status}</p>
      <div className="mx-auto grid aspect-square w-full max-w-[300px] grid-cols-3 gap-2">
        {game.board.map((c, i) => (
          <button
            key={i}
            type="button"
            disabled={!myTurn || !!c}
            onClick={() => emit("games.move", { roomId: game.id, cell: i })}
            className={`flex items-center justify-center rounded-2xl text-5xl font-bold transition active:scale-95 ${game.line?.includes(i) ? "bg-brand text-on-brand" : "bg-surface-sunken"} ${c === game.you ? "text-brand-strong" : "text-ink-primary"}`}
          >
            {c ? (c === "X" ? game.players.X?.avatar : game.players.O?.avatar) : ""}
          </button>
        ))}
      </div>
      <div className="flex justify-center gap-2">
        {REACTIONS.map((r) => (
          <button key={r} type="button" onClick={() => { emit("games.react", { roomId: game.id, emoji: r }); setReaction({ emoji: r, mine: true }); setTimeout(() => setReaction(null), 1500); }} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-xl active:scale-90">{r}</button>
        ))}
      </div>
      {reaction && <div className={`pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 text-7xl ${reaction.mine ? "opacity-70" : ""}`} style={{ animation: "pop 300ms ease-out" }}>{reaction.emoji}</div>}
      <div className="flex gap-2">
        {game.winner && <button type="button" onClick={() => emit("games.rematch", { roomId: game.id })} className="min-h-12 flex-1 rounded-full bg-brand font-semibold text-on-brand">{t("rematch")}</button>}
        <button type="button" onClick={() => emit("games.leave", { roomId: game.id })} className="min-h-12 flex-1 rounded-full border border-border-strong font-semibold">{t("leave")}</button>
      </div>
    </div>
  );
}
