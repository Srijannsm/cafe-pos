import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AddOrderDto } from './dto/add-item.dto.js';
import { RecordPaymentDto } from './dto/record-payment.dto.js';
import { Prisma, OrderStatus } from '../generated/prisma/client.js';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(status?: OrderStatus) {
    return this.prisma.order.findMany({
      where: status ? { status } : undefined,
      include: {
        orderItems: {
          include: {
            menuItem: true,
            orderItemModifiers: { include: { modifier: true } },
          },
        },
        table: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateOrderDto) {
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: dto.tableId },
    });

    if (!table) {
      throw new NotFoundException(`Table ${dto.tableId} does not exist`);
    }

    if (table.status !== 'free') {
      throw new BadRequestException(`Table ${dto.tableId} is not free`);
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          tableId: dto.tableId,
          waiterId: dto.waiterId,
          orderType: dto.orderType,
        },
      });

      await tx.restaurantTable.update({
        where: { id: dto.tableId },
        data: { status: 'occupied' },
      });

      return order;
    });
  }

  async addItem(orderId: number, dto: AddOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: dto.menuItemId },
    });

    if (!menuItem) {
      throw new NotFoundException(`Menu item ${dto.menuItemId} does not exist`);
    }

    return this.prisma.$transaction(async (tx) => {
      const orderItem = await tx.orderItem.create({
        data: {
          orderId,
          menuItemId: dto.menuItemId,
          quantity: dto.quantity,
          price: menuItem.price, // snapshotting the CURRENT price at order time
        },
      });

      if (dto.modifierIds && dto.modifierIds.length > 0) {
        await tx.orderItemModifier.createMany({
          data: dto.modifierIds.map((modifierId) => ({
            orderItemId: orderItem.id,
            modifierId,
          })),
        });
      }

      return tx.orderItem.findUnique({
        where: { id: orderItem.id },
        include: { orderItemModifiers: { include: { modifier: true } } },
      });
    });
  }

  async sendToKitchen(orderId: number) {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: true },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  if (order.status !== 'pending') {
    throw new BadRequestException(
      `Order ${orderId} cannot be sent to kitchen from status "${order.status}"`,
    );
  }

  if (order.orderItems.length === 0) {
    throw new BadRequestException(
      `Order ${orderId} has no items — add at least one item before sending to kitchen`,
    );
  }

  return this.prisma.order.update({
    where: { id: orderId },
    data: { status: 'preparing' },
  });
}

    async markItemReady(orderItemId: number) {
    const orderItem = await this.prisma.orderItem.findUnique({
    where: { id: orderItemId },
  });

  if (!orderItem) {
    throw new NotFoundException(`Order item ${orderItemId} does not exist`);
  }

  if (orderItem.status !== 'pending') {
    throw new BadRequestException(
      `Order item ${orderItemId} cannot be marked ready from status "${orderItem.status}"`,
    );
  }

  return this.prisma.orderItem.update({
    where: { id: orderItemId },
    data: { status: 'ready' },
  });
}    

    async serve(orderId: number) {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  if (order.status !== 'preparing') {
    throw new BadRequestException(
      `Order ${orderId} cannot be served from status "${order.status}"`,
    );
  }

  return this.prisma.order.update({
    where: { id: orderId },
    data: { status: 'served' },
  });
}

    async cancel(orderId: number) {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  if (order.status !== 'pending') {
    throw new BadRequestException(
      `Order ${orderId} cannot be cancelled from status "${order.status}" — cancellation is only allowed before the order is sent to kitchen`,
    );
  }

  return this.prisma.$transaction(async (tx) => {
    const cancelledOrder = await tx.order.update({
      where: { id: orderId },
      data: { status: 'cancelled' },
    });

    await tx.restaurantTable.update({
      where: { id: order.tableId },
      data: { status: 'free' },
    });

    return cancelledOrder;
  });
}

  async generateBill(orderId: number) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            orderItemModifiers: {
              include: { modifier: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} does not exist`);
    }

    if (order.status !== 'served') {
      throw new BadRequestException(
        `Order ${orderId} cannot be billed from status "${order.status}"`,
      );
    }

    let total = new Prisma.Decimal(0);

    for (const item of order.orderItems) {
      const modifierTotal = item.orderItemModifiers.reduce(
        (sum, oim) => sum.plus(oim.modifier.priceDelta),
        new Prisma.Decimal(0),
      );
      const lineTotal = item.price.plus(modifierTotal).times(item.quantity);
      total = total.plus(lineTotal);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'billed', total },
    });
  }

  async recordPayment(orderId: number, dto: RecordPaymentDto) {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  if (order.status !== 'billed') {
    throw new BadRequestException(
      `Order ${orderId} cannot be paid from status "${order.status}"`,
    );
  }

  return this.prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        orderId,
        amount: order.total!,
        method: dto.method,
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'paid' },
    });

    await tx.restaurantTable.update({
      where: { id: order.tableId },
      data: { status: 'free' },
    });

    return payment;
  });
}

  async findOne(orderId: number) {
  const order = await this.prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: {
          menuItem: true,
          orderItemModifiers: {
            include: { modifier: true },
          },
        },
      },
      table: true,
      waiter: { select: { id: true, name: true } },
    },
  });

  if (!order) {
    throw new NotFoundException(`Order ${orderId} does not exist`);
  }

  return order;
}

}
