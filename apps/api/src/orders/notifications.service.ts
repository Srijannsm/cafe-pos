// The one place a staff notification is created. Each one is saved first
// and then broadcast, so a screen that wasn't listening at that moment (a
// phone asleep, a tab showing the kitchen page, a reload) still sees it
// next time it loads GET /notifications.
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersGateway } from './orders.gateway.js';
import { Prisma } from '../generated/prisma/client.js';

export type NotificationType =
  | 'qr_order' | 'call_waiter' | 'request_bill' | 'ready' | 'recalled' | 'sent' | 'voided'
  | 'cancel_request' | 'cancel_approved' | 'cancel_rejected';

export type NotificationData = {
  /** e.g. ["2x Momo", "1x Latte"] */
  items?: string[];
  /** total quantity */
  count?: number;
  waiter?: string | null;
  /** ready: seconds from sent-to-kitchen to ready */
  cookSecs?: number | null;
  /** voided / cancel_*: why */
  reason?: string;
  /** cancel_*: the OrderCancelRequest id and who asked / decided */
  requestId?: number;
  requestedBy?: string;
  decidedBy?: string;
};

// Kitchen traffic only matters to a manager; waiters would drown in it.
// Cancel requests go to admins -- they're the ones who can approve.
const ADMIN_ONLY: NotificationType[] = ['sent', 'voided', 'cancel_request'];
const KEEP_HOURS = 24;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService, private gateway: OrdersGateway) {}

  /** Save + broadcast. Never throws: a notification must not break an order action. */
  async notify(cafeId: number, type: NotificationType, n: { orderId?: number | null; tableNumber?: string | null; data?: NotificationData }) {
    try {
      const row = await this.prisma.notification.create({
        data: { cafeId, type, orderId: n.orderId ?? null, tableNumber: n.tableNumber ?? null, data: (n.data ?? {}) as Prisma.InputJsonValue },
      });
      this.gateway.emitCafe(cafeId, 'notification', row);
      // Keep the table small: now and then, drop rows older than a week.
      if (Math.random() < 0.02) {
        void this.prisma.notification
          .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } })
          .catch(() => undefined);
      }
    } catch (err) {
      this.logger.warn(`Could not record ${type} notification: ${(err as Error).message}`);
    }
  }

  /** The last 24h for this cafe, newest first (max 50), filtered for the role. */
  list(cafeId: number, role: string) {
    return this.prisma.notification.findMany({
      where: {
        cafeId,
        createdAt: { gte: new Date(Date.now() - KEEP_HOURS * 3600 * 1000) },
        ...(role === 'admin' ? {} : { type: { notIn: ADMIN_ONLY } }),
      },
      orderBy: { id: 'desc' },
      take: 50,
    });
  }
}
