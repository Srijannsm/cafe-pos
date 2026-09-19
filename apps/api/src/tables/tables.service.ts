import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateTableDto } from './dto/create-table.dto.js';
import { UpdateTableDto } from './dto/update-table.dto.js';

@Injectable()
export class TablesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const tables = await this.prisma.restaurantTable.findMany({
      orderBy: { tableNumber: 'asc' },
    });

    const activeOrders = await this.prisma.order.findMany({
      where: { status: { notIn: ['paid', 'cancelled'] } },
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

  createTable(dto: CreateTableDto) {
    return this.prisma.restaurantTable.create({ data: dto });
  }

  async updateTable(id: number, dto: UpdateTableDto) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) {
      throw new NotFoundException(`Table ${id} does not exist`);
    }
    return this.prisma.restaurantTable.update({ where: { id }, data: dto });
  }
}
