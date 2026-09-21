import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PublicOrderingController } from './public-ordering.controller.js';
import { PublicOrderingService } from './public-ordering.service.js';

@Module({
  imports: [PrismaModule, OrdersModule],
  controllers: [PublicOrderingController],
  providers: [PublicOrderingService],
})
export class PublicOrderingModule {}
