import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';

// Why this exists: discounts, voids, cancelled orders, reopened bills and
// stock corrections are exactly the actions that money goes missing through.
// Writing one append-only row per action (who, what, when, why) is what lets
// the owner trust the numbers -- and it's what the "Discounts & voids" report
// reads. Nothing in the app ever updates or deletes these rows.
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    cafeId: number,
    actor: Pick<CurrentUserPayload, 'userId' | 'name'> | null,
    action: string,
    entity: string,
    entityId: number | null,
    details?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        cafeId,
        actorId: actor?.userId ?? null,
        actorName: actor?.name ?? null,
        action,
        entity,
        entityId,
        details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  list(cafeId: number, opts: { from?: Date; to?: Date; action?: string; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        cafeId,
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.from || opts.to ? { createdAt: { gte: opts.from, lte: opts.to } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.take ?? 200,
    });
  }
}
