import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { OrdersGateway } from './orders.gateway.js';
import { KitchenService } from './kitchen.service.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';
import { CancelRequestsService } from './cancel-requests.service.js';
import { CancelRequestsController } from './cancel-requests.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrdersController, NotificationsController, CancelRequestsController],
  providers: [OrdersService, OrdersGateway, KitchenService, NotificationsService, CancelRequestsService],
  exports: [OrdersService, OrdersGateway, NotificationsService],
})
export class OrdersModule {}
