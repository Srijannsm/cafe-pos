import { Module } from '@nestjs/common';
import { MenuController } from './menu.controller.js';
import { MenuService } from './menu.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';

@Module({
  imports: [PrismaModule, AuthModule, OrdersModule],
  controllers: [MenuController],
  providers: [MenuService],
})
export class MenuModule {}