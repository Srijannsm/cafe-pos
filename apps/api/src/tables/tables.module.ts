import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller.js';
import { TablesService } from './tables.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';

@Module({
  imports: [PrismaModule, AuthModule, OrdersModule],
  controllers: [TablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}