import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { ReportsQueryDto } from './dto/reports-query.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserPayload, @Query() query: ReportsQueryDto) {
    return this.reportsService.getSummary(user.cafeId, query);
  }

  @Get('revenue-by-day')
  revenueByDay(@CurrentUser() user: CurrentUserPayload, @Query() query: ReportsQueryDto) {
    return this.reportsService.getRevenueByDay(user.cafeId, query);
  }

  @Get('top-items')
  topItems(@CurrentUser() user: CurrentUserPayload, @Query() query: ReportsQueryDto) {
    return this.reportsService.getTopItems(user.cafeId, query);
  }

  @Get('payment-methods')
  paymentMethods(@CurrentUser() user: CurrentUserPayload, @Query() query: ReportsQueryDto) {
    return this.reportsService.getPaymentMethods(user.cafeId, query);
  }
}
