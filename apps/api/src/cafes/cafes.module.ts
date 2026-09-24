import { Module } from '@nestjs/common';
import { CafesController } from './cafes.controller.js';
import { CafesService } from './cafes.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CafesController],
  providers: [CafesService],
  exports: [CafesService],
})
export class CafesModule {}
