import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTableDto } from './dto/create-table.dto.js';
import { UpdateTableDto } from './dto/update-table.dto.js';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async findAll(cafeId: number) {
    const tables = await this.prisma.restaurantTable.findMany({
      where: { cafeId },
      orderBy: { tableNumber: 'asc' },
    });

    const activeOrders = await this.prisma.order.findMany({
      where: { cafeId, status: { notIn: ['paid', 'cancelled'] } },
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

  createTable(cafeId: number, dto: CreateTableDto) {
    return this.prisma.restaurantTable.create({ data: { ...dto, cafeId } });
  }

  async updateTable(cafeId: number, id: number, dto: UpdateTableDto) {
    // Scoping the lookup itself (not just checking afterwards) is what
    // stops staff at one cafe from updating -- or even learning the
    // existence of -- a table id that belongs to a different cafe.
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, cafeId } });
    if (!table) {
      throw new NotFoundException(`Table ${id} does not exist`);
    }
    return this.prisma.restaurantTable.update({ where: { id }, data: dto });
  }

  async regenerateQr(cafeId: number, id: number) {
    // Invalidates the old link outright (old printed QR codes stop working)
    // rather than layering on a second valid token -- the point of
    // regenerating is that a token you suspect is compromised or a table
    // that's being reprinted should have exactly one live link afterwards.
    const table = await this.prisma.restaurantTable.findFirst({ where: { id, cafeId } });
    if (!table) {
      throw new NotFoundException(`Table ${id} does not exist`);
    }
    const qrToken = randomBytes(18).toString('base64url');
    return this.prisma.restaurantTable.update({ where: { id }, data: { qrToken } });
  }
}
