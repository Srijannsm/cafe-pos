import { Logger } from '@nestjs/common';
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage,
  WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { hasFeature } from '../subscription/plan-limits.js';

// "Play while you wait" -- a tiny tic-tac-toe for customers on the QR page.
//
// Design choices (all about keeping it safe and zero-maintenance for owners):
//  * Opt-in per cafe (Cafe.gamesEnabled), off by default.
//  * Authenticated by the table's qrToken, same as QR ordering -- no
//    accounts, no names. Players are "Table 5 🦊".
//  * No chat. Only a fixed set of emoji reactions, so there's nothing to
//    moderate and no way to harass another table.
//  * Server-authoritative: the server holds the board and validates every
//    move, so a modified client can't cheat.
//  * State is in memory -- a restart just ends the running games, which is
//    fine for a 1-minute game.
type Seat = { socketId: string; tableId: number; tableNumber: string; avatar: string };
type Room = {
  id: string;
  cafeId: number;
  mode: 'table' | 'open';
  hostTableId: number;
  board: (null | 'X' | 'O')[];
  turn: 'X' | 'O';
  players: { X?: Seat; O?: Seat };
  winner: null | 'X' | 'O' | 'draw';
  line: number[] | null;
  score: { X: number; O: number; draw: number };
  createdAt: number;
};

const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🦁', '🐨', '🐙', '🦄', '🐝'];
const REACTIONS = ['👏', '😂', '😮', '🔥', '🤝'];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

@WebSocketGateway({
  namespace: 'games',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class GamesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GamesGateway.name);
  private rooms = new Map<string, Room>();

  @WebSocketServer()
  server: Server;

  constructor(private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const qrToken = client.handshake.auth?.qrToken as string | undefined;
    if (!qrToken) return client.disconnect(true);
    const table = await this.prisma.restaurantTable.findUnique({
      where: { qrToken },
      include: { cafe: { select: { id: true, isActive: true, gamesEnabled: true, plan: true, subscriptionStatus: true } } },
    });
    if (!table || !table.cafe.isActive || !table.cafe.gamesEnabled || !hasFeature(table.cafe, 'tableGame')) {
      client.emit('games.error', { message: 'Games are not available here' });
      return client.disconnect(true);
    }
    client.data = {
      cafeId: table.cafeId,
      tableId: table.id,
      tableNumber: table.tableNumber,
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    };
    client.join(`cafe:${table.cafeId}`);
    client.join(`table:${table.id}`);
    client.emit('games.hello', { avatar: client.data.avatar, tableNumber: table.tableNumber });
    this.sendLobby(client);
  }

  handleDisconnect(client: Socket) {
    for (const room of this.rooms.values()) {
      const seat = (['X', 'O'] as const).find((s) => room.players[s]?.socketId === client.id);
      if (!seat) continue;
      this.server.to(room.id).emit('games.ended', { reason: 'The other player left' });
      this.rooms.delete(room.id);
      this.broadcastLobby(room.cafeId);
    }
  }

  private me(client: Socket): Seat {
    return { socketId: client.id, tableId: client.data.tableId, tableNumber: client.data.tableNumber, avatar: client.data.avatar };
  }

  private lobbyFor(cafeId: number, tableId: number) {
    return [...this.rooms.values()]
      .filter((r) => r.cafeId === cafeId && !r.players.O && (r.mode === 'open' || r.hostTableId === tableId))
      .map((r) => ({
        id: r.id,
        mode: r.mode,
        host: `Table ${r.players.X!.tableNumber}`,
        avatar: r.players.X!.avatar,
        sameTable: r.hostTableId === tableId,
      }));
  }

  private sendLobby(client: Socket) {
    client.emit('games.lobby', this.lobbyFor(client.data.cafeId, client.data.tableId));
  }

  private async broadcastLobby(cafeId: number) {
    const sockets = await this.server.in(`cafe:${cafeId}`).fetchSockets();
    for (const s of sockets) s.emit('games.lobby', this.lobbyFor(cafeId, s.data.tableId));
  }

  private publicState(room: Room) {
    return {
      id: room.id,
      mode: room.mode,
      board: room.board,
      turn: room.turn,
      winner: room.winner,
      line: room.line,
      score: room.score,
      players: {
        X: room.players.X ? { table: room.players.X.tableNumber, avatar: room.players.X.avatar } : null,
        O: room.players.O ? { table: room.players.O.tableNumber, avatar: room.players.O.avatar } : null,
      },
    };
  }

  @SubscribeMessage('games.host')
  host(@ConnectedSocket() client: Socket, @MessageBody() body: { mode?: 'table' | 'open' }) {
    if (!client.data?.cafeId) return;
    // One hosted room per socket.
    for (const r of this.rooms.values()) if (r.players.X?.socketId === client.id && !r.players.O) this.rooms.delete(r.id);
    const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const room: Room = {
      id, cafeId: client.data.cafeId, mode: body?.mode === 'open' ? 'open' : 'table', hostTableId: client.data.tableId,
      board: Array(9).fill(null), turn: 'X', players: { X: this.me(client) }, winner: null, line: null,
      score: { X: 0, O: 0, draw: 0 }, createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    client.join(id);
    client.emit('games.state', { ...this.publicState(room), you: 'X' });
    this.broadcastLobby(room.cafeId);
  }

  @SubscribeMessage('games.join')
  join(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    const room = this.rooms.get(body?.roomId);
    if (!room || room.cafeId !== client.data?.cafeId || room.players.O) {
      return client.emit('games.error', { message: 'That game is no longer open' });
    }
    if (room.mode === 'table' && room.hostTableId !== client.data.tableId) {
      return client.emit('games.error', { message: 'That game is only for its own table' });
    }
    if (room.players.X?.socketId === client.id) return;
    room.players.O = this.me(client);
    client.join(room.id);
    this.server.to(room.players.X!.socketId).emit('games.state', { ...this.publicState(room), you: 'X' });
    client.emit('games.state', { ...this.publicState(room), you: 'O' });
    this.broadcastLobby(room.cafeId);
  }

  @SubscribeMessage('games.move')
  move(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string; cell: number }) {
    const room = this.rooms.get(body?.roomId);
    if (!room || room.winner || !room.players.O) return;
    const seat = (['X', 'O'] as const).find((s) => room.players[s]?.socketId === client.id);
    const cell = Number(body.cell);
    if (!seat || seat !== room.turn || !Number.isInteger(cell) || cell < 0 || cell > 8 || room.board[cell]) return;

    room.board[cell] = seat;
    const win = LINES.find((l) => l.every((i) => room.board[i] === seat));
    if (win) {
      room.winner = seat;
      room.line = win;
      room.score[seat] += 1;
    } else if (room.board.every(Boolean)) {
      room.winner = 'draw';
      room.score.draw += 1;
    } else {
      room.turn = seat === 'X' ? 'O' : 'X';
    }
    this.emitState(room);
  }

  @SubscribeMessage('games.rematch')
  rematch(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    const room = this.rooms.get(body?.roomId);
    if (!room || !room.winner) return;
    if (!(['X', 'O'] as const).some((s) => room.players[s]?.socketId === client.id)) return;
    // Loser (or O after a draw) starts next.
    room.turn = room.winner === 'X' ? 'O' : room.winner === 'O' ? 'X' : 'O';
    room.board = Array(9).fill(null);
    room.winner = null;
    room.line = null;
    this.emitState(room);
  }

  @SubscribeMessage('games.react')
  react(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string; emoji: string }) {
    const room = this.rooms.get(body?.roomId);
    if (!room || !REACTIONS.includes(body.emoji)) return;
    const seat = (['X', 'O'] as const).find((s) => room.players[s]?.socketId === client.id);
    if (!seat) return;
    this.server.to(room.id).emit('games.reaction', { from: seat, emoji: body.emoji });
  }

  @SubscribeMessage('games.leave')
  leave(@ConnectedSocket() client: Socket, @MessageBody() body: { roomId: string }) {
    const room = this.rooms.get(body?.roomId);
    if (!room) return;
    this.server.to(room.id).emit('games.ended', { reason: 'Game closed' });
    this.server.in(room.id).socketsLeave(room.id);
    this.rooms.delete(room.id);
    this.broadcastLobby(room.cafeId);
  }

  @SubscribeMessage('games.lobby')
  lobby(@ConnectedSocket() client: Socket) {
    if (client.data?.cafeId) this.sendLobby(client);
  }

  private emitState(room: Room) {
    for (const s of ['X', 'O'] as const) {
      const p = room.players[s];
      if (p) this.server.to(p.socketId).emit('games.state', { ...this.publicState(room), you: s });
    }
  }
}
