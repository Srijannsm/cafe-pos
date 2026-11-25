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
  constructor(private reports: ReportsService) {}

  @Get('overview') overview(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.overview(u.cafeId, q); }
  @Get('items') items(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.items(u.cafeId, q); }
  @Get('staff') staff(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.staff(u.cafeId, q); }
  @Get('bills') bills(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.bills(u.cafeId, q); }
  @Get('exceptions') exceptions(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.exceptions(u.cafeId, q); }
  @Get('shifts') shifts(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.shifts(u.cafeId, q); }
  @Get('purchases') purchases(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.purchases(u.cafeId, q); }
  @Get('stock') stock(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.stock(u.cafeId, q); }
  @Get('profit') profit(@CurrentUser() u: CurrentUserPayload, @Query() q: ReportsQueryDto) { return this.reports.profit(u.cafeId, q); }
}
