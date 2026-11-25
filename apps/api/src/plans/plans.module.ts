import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PlansService } from './plans.service.js';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
