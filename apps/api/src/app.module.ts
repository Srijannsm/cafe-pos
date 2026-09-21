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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    MenuModule,
    OrdersModule,
    AuthModule,
    UsersModule,
    TablesModule,
    CafesModule,
    PlatformAuthModule,
    PlatformAdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}