import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ShiftsController } from './shifts.controller.js';
import { ShiftsService } from './shifts.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
})
export class ShiftsModule {}
