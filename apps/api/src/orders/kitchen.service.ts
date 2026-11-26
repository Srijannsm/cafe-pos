// Everything the kitchen display (KDS) needs, in one call, already shaped
// into tickets -- so every kitchen screen shows the same thing and the
// browser doesn't have to download and regroup every open order.
//
// Ticket = one "round": the items of one order that were sent to the kitchen
// together (same OrderItem.sentAt). A table that orders more later gets a
// new ticket ("Round 2") with its own timer, instead of being merged into
// the first one.
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersGateway } from './orders.gateway.js';
import { Station } from '../generated/prisma/client.js';

export type KdsItem = {
  id: number;
  quantity: number;
  name: string;
  modifiers: string[];
  note: string | null;
  station: Station;
  status: 'pending' | 'ready' | 'served';
  voided: boolean;
  readyAt: Date | null;
};
export type KdsTicket = {
  key: string;
  orderId: number;
  round: number;
  table: string;
  orderType: 'dine_in' | 'takeaway';
  source: 'staff' | 'qr';
  waiter: string | null;
  notes: string | null;
  sentAt: Date;
  readyAt: Date | null;
  items: KdsItem[];
  /** Every item on the whole order is ready -> the waiter can serve it. */
  orderAllReady: boolean;
};

const STATIONS: Station[] = ['kitchen', 'bar', 'hookah'];

@Injectable()
export class KitchenService {
  constructor(private prisma: PrismaService, private gateway: OrdersGateway) {}

  async board(cafeId: number, station?: Station, tzMinutes = 345) {
    const orders = await this.prisma.order.findMany({
      where: { cafeId, status: 'preparing' },
      include: {
        table: { select: { tableNumber: true } },
        waiter: { select: { name: true } },
        orderItems: {
          where: { sentToKitchen: true },
          orderBy: { id: 'asc' },
          include: { menuItem: { select: { name: true } }, orderItemModifiers: { include: { modifier: { select: { name: true } } } } },
        },
      },
    });

    const cooking: KdsTicket[] = [];
    const ready: KdsTicket[] = [];
    const counts: Record<'all' | Station, number> = { all: 0, kitchen: 0, bar: 0, hookah: 0 };
    const allDay = new Map<string, number>();

    for (const o of orders) {
      const live = (i: (typeof o.orderItems)[number]) => !i.voidedAt;
      const orderAllReady = !o.orderItems.some((i) => live(i) && i.status === 'pending');

      for (const i of o.orderItems) {
        if (live(i) && i.status === 'pending') {
          counts.all += i.quantity;
          counts[i.station] += i.quantity;
        }
      }

      // Rounds, oldest first, numbered across the whole order.
      const rounds = new Map<number, typeof o.orderItems>();
      for (const i of o.orderItems) {
        const t = (i.sentAt ?? i.createdAt).getTime();
        rounds.set(t, [...(rounds.get(t) ?? []), i]);
      }
      const keys = [...rounds.keys()].sort((a, b) => a - b);

      keys.forEach((t, idx) => {
        const items = rounds.get(t)!.filter((i) => !station || i.station === station);
        if (items.length === 0) return;
        const pending = items.filter((i) => live(i) && i.status === 'pending');
        const readyItems = items.filter((i) => live(i) && i.status === 'ready');
        // Show voids only while the cook may still be making them.
        const shown = items.filter((i) => i.status !== 'served' && !(i.voidedAt && i.status !== 'pending'));
        if (pending.length === 0 && readyItems.length === 0) return;

        const ticket: KdsTicket = {
          key: `${o.id}-${t}`,
          orderId: o.id,
          round: idx + 1,
          table: o.table.tableNumber,
          orderType: o.orderType,
          source: o.source,
          waiter: o.waiter?.name ?? null,
          notes: o.notes,
          sentAt: new Date(t),
          readyAt: pending.length === 0 ? new Date(Math.max(...readyItems.map((i) => (i.readyAt ?? i.createdAt).getTime()))) : null,
          items: shown.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            name: i.menuItem.name,
            modifiers: i.orderItemModifiers.map((m) => m.modifier.name),
            note: i.note,
            station: i.station,
            status: i.status,
            voided: !!i.voidedAt,
            readyAt: i.readyAt,
          })),
          orderAllReady,
        };
        if (pending.length > 0) {
          cooking.push(ticket);
          for (const i of pending) allDay.set(i.menuItem.name, (allDay.get(i.menuItem.name) ?? 0) + i.quantity);
        } else {
          ready.push(ticket);
        }
      });
    }

    cooking.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    ready.sort((a, b) => (b.readyAt?.getTime() ?? 0) - (a.readyAt?.getTime() ?? 0));

    return {
      now: new Date(),
      cooking,
      ready: ready.slice(0, 30),
      counts,
      allDay: [...allDay.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity),
      stats: await this.todayStats(cafeId, station, tzMinutes),
    };
  }

  /** Tickets finished today and how long they took (sent -> last item ready). */
  private async todayStats(cafeId: number, station: Station | undefined, tz: number) {
    const now = Date.now();
    const local = new Date(now + tz * 60000);
    const startOfDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - tz * 60000);
    const done = await this.prisma.orderItem.findMany({
      where: {
        order: { cafeId },
        readyAt: { gte: startOfDay },
        sentAt: { not: null },
        voidedAt: null,
        ...(station ? { station } : {}),
      },
      select: { orderId: true, sentAt: true, readyAt: true, quantity: true },
    });
    const tickets = new Map<string, number>();
    let items = 0;
    for (const i of done) {
      items += i.quantity;
      const k = `${i.orderId}-${i.sentAt!.getTime()}`;
      const secs = (i.readyAt!.getTime() - i.sentAt!.getTime()) / 1000;
      tickets.set(k, Math.max(tickets.get(k) ?? 0, secs));
    }
    const times = [...tickets.values()];
    return {
      ticketsDone: times.length,
      itemsDone: items,
      avgTicketSecs: times.length ? Math.round(times.reduce((s, x) => s + x, 0) / times.length) : null,
    };
  }

  /** Bump several items in one go (a whole ticket) -- one request, one event. */
  async markReady(cafeId: number, ids: number[]) {
    const items = await this.prisma.orderItem.findMany({
      where: { id: { in: ids }, order: { cafeId }, status: 'pending', voidedAt: null, sentToKitchen: true },
      select: { id: true, orderId: true },
    });
    if (items.length === 0) throw new BadRequestException('Nothing to mark ready -- it may already be done');
    await this.prisma.orderItem.updateMany({
      where: { id: { in: items.map((i) => i.id) } },
      data: { status: 'ready', readyAt: new Date() },
    });
    for (const orderId of new Set(items.map((i) => i.orderId))) {
      this.gateway.emitOrderItemReady(cafeId, { orderId, orderItemId: items.find((i) => i.orderId === orderId)!.id });
    }
    this.gateway.emitFloorChanged(cafeId);
    return { updated: items.length };
  }

  isStation(s: string | undefined): s is Station {
    return !!s && (STATIONS as string[]).includes(s);
  }
}
