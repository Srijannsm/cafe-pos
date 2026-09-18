import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const tables = await this.prisma.restaurantTable.findMany({
      orderBy: { tableNumber: 'asc' },
    });

    const activeOrders = await this.prisma.order.findMany({
      where: { status: { not: 'paid' } },
      select: { id: true, tableId: true, status: true },
    });

    return tables.map((table) => {
      const activeOrder = activeOrders.find((order) => order.tableId === table.id);
      return {
        ...table,
        activeOrderId: activeOrder?.id ?? null,
        activeOrderStatus: activeOrder?.status ?? null,
      };
    });
  }
}