import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MenuModule } from './menu/menu.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { TablesModule } from './tables/tables.module.js';
import { CafesModule } from './cafes/cafes.module.js';
import { PlatformAdminModule } from './platform-admin/platform-admin.module.js';
import { PlatformAuthModule } from './platform-auth/platform-auth.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { PublicOrderingModule } from './public-ordering/public-ordering.module.js';
import { AuditModule } from './audit/audit.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { ShiftsModule } from './shifts/shifts.module.js';
import { GamesModule } from './games/games.module.js';
import { PlansModule } from './plans/plans.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    PlansModule,
    MenuModule,
    OrdersModule,
    AuthModule,
    UsersModule,
    TablesModule,
    CafesModule,
    PlatformAuthModule,
    PlatformAdminModule,
    ReportsModule,
    PublicOrderingModule,
    AuditModule,
    UploadsModule,
    InventoryModule,
    ShiftsModule,
    GamesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}