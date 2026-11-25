import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlansService } from '../plans/plans.service.js';
import { UpdatePlanDto } from '../plans/update-plan.dto.js';
import { BadRequestException } from '@nestjs/common';
import { PlatformJwtAuthGuard } from '../platform-auth/platform-jwt-auth.guard.js';
import { CreateCafeDto } from './dto/create-cafe.dto.js';
import { ExtendTrialDto, RecordSubscriptionPaymentDto, ResetPinDto, UpdateCafeDto } from './dto/update-cafe.dto.js';

@UseGuards(PlatformJwtAuthGuard)
@Controller('platform')
export class PlatformAdminController {
  constructor(
    private platformAdminService: PlatformAdminService,
    private plansService: PlansService,
  ) {}

  @Get('plans')
  plans() {
    return this.plansService.listWithUsage();
  }

  @Patch('plans/:key')
  updatePlan(@Param('key') key: string, @Body() dto: UpdatePlanDto) {
    if (!['starter', 'standard', 'premium'].includes(key)) throw new BadRequestException('Unknown plan');
    return this.plansService.update(key as 'starter' | 'standard' | 'premium', dto);
  }

  @Get('overview')
  overview() {
    return this.platformAdminService.getOverview();
  }

  @Get('cafes')
  findAll() {
    return this.platformAdminService.findAllCafes();
  }

  @Get('cafes/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.platformAdminService.findCafeDetail(id);
  }

  @Post('cafes')
  create(@Body() dto: CreateCafeDto) {
    return this.platformAdminService.createCafe(dto);
  }

  @Patch('cafes/:id')
  setActive(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCafeDto) {
    return this.platformAdminService.updateCafe(id, dto);
  }

  @Post('cafes/:id/payments')
  recordPayment(@Param('id', ParseIntPipe) id: number, @Body() dto: RecordSubscriptionPaymentDto) {
    return this.platformAdminService.recordPayment(id, dto);
  }

  @Post('cafes/:id/extend-trial')
  extendTrial(@Param('id', ParseIntPipe) id: number, @Body() dto: ExtendTrialDto) {
    return this.platformAdminService.extendTrial(id, dto);
  }

  @Post('cafes/:id/users/:userId/reset-pin')
  resetPin(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ResetPinDto,
  ) {
    return this.platformAdminService.resetPin(id, userId, dto);
  }
}
