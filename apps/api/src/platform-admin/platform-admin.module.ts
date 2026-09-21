import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformAdminGuard],
})
export class PlatformAdminModule {}
