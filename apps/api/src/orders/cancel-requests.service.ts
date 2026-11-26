// Cancelling an order the kitchen already has ("the customer had to leave").
//
// Anyone on shift can ASK from the kitchen screen; only an admin can
// approve, because food may already be made (cost) and it's an easy way to
// hide a sale. An admin asking is approved straight away. Approving runs the
// existing OrdersService.cancel() -- the same path as an admin cancelling
// from the order screen: items voided, tracked stock returned, table freed,
// audit-logged -- so there is one cancel implementation, not two.
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';
import { OrdersGateway } from './orders.gateway.js';
import { NotificationsService } from './notifications.service.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';

type Actor = Pick<CurrentUserPayload, 'userId' | 'name' | 'role'>;
const CANCELLABLE = ['preparing', 'served'];

@Injectable()
export class CancelRequestsService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private gateway: OrdersGateway,
    private notifications: NotificationsService,
  ) {}

  async request(cafeId: number, orderId: number, reason: string, actor: Actor) {
    reason = reason.trim();
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: { table: { select: { tableNumber: true } } },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} does not exist`);
    if (order.status === 'pending') {
      throw new BadRequestException('This order has not reached the kitchen yet -- cancel it from the order screen');
    }
    if (!CANCELLABLE.includes(order.status)) {
      throw new BadRequestException(`An order that is ${order.status} cannot be cancelled here`);
    }

    // One open request per order. The row lock makes two people tapping
    // "cancel" at the same moment produce one request, not two.
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const open = await tx.orderCancelRequest.findFirst({ where: { orderId, status: 'pending' } });
      if (open) throw new ConflictException('A cancellation is already waiting for admin approval');
      return tx.orderCancelRequest.create({
        data: { cafeId, orderId, reason, requestedById: actor.userId, requestedBy: actor.name },
      });
    });

    if (actor.role === 'admin') return this.decide(cafeId, created.id, true, actor);

    await this.notifications.notify(cafeId, 'cancel_request', {
      orderId,
      tableNumber: order.table?.tableNumber,
      data: { requestId: created.id, reason, requestedBy: actor.name },
    });
    this.gateway.emitFloorChanged(cafeId); // kitchen screens show "awaiting approval"
    return created;
  }

  async decide(cafeId: number, id: number, approve: boolean, actor: Actor) {
    // Claim it first, so a double tap / two admins can't decide twice.
    const claimed = await this.prisma.orderCancelRequest.updateMany({
      where: { id, cafeId, status: 'pending' },
      data: { status: approve ? 'approved' : 'rejected', decidedById: actor.userId, decidedBy: actor.name, decidedAt: new Date() },
    });
    const req = await this.prisma.orderCancelRequest.findFirst({
      where: { id, cafeId },
      include: { order: { select: { table: { select: { tableNumber: true } } } } },
    });
    if (!req) throw new NotFoundException('Cancellation request not found');
    if (claimed.count === 0) throw new ConflictException(`This request was already ${req.status}`);

    if (approve) {
      try {
        const note = req.requestedById === actor.userId ? req.reason : `${req.reason} (requested by ${req.requestedBy})`;
        await this.orders.cancel(cafeId, req.orderId, actor, note);
      } catch (err) {
        // e.g. the bill was printed or paid in the meantime -- put it back.
        await this.prisma.orderCancelRequest.update({
          where: { id },
          data: { status: 'pending', decidedById: null, decidedBy: null, decidedAt: null },
        });
        throw err;
      }
    }

    await this.notifications.notify(cafeId, approve ? 'cancel_approved' : 'cancel_rejected', {
      orderId: req.orderId,
      tableNumber: req.order?.table?.tableNumber,
      data: { requestId: id, reason: req.reason, requestedBy: req.requestedBy, decidedBy: actor.name },
    });
    this.gateway.emitFloorChanged(cafeId);
    return { ...req, status: approve ? 'approved' : 'rejected', decidedBy: actor.name };
  }

  /** Open requests by order id -- shown on the kitchen tickets. */
  async pendingFor(cafeId: number, orderIds: number[]) {
    if (!orderIds.length) return new Map<number, { id: number; reason: string; requestedBy: string; createdAt: Date }>();
    const rows = await this.prisma.orderCancelRequest.findMany({
      where: { cafeId, status: 'pending', orderId: { in: orderIds } },
      select: { id: true, orderId: true, reason: true, requestedBy: true, createdAt: true },
    });
    return new Map(rows.map((r) => [r.orderId, { id: r.id, reason: r.reason, requestedBy: r.requestedBy, createdAt: r.createdAt }]));
  }
}
