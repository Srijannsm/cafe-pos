import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminService } from './platform-admin.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module.js';

@Module({
  imports: [PrismaModule, PlatformAuthModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
