import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { ShiftsService } from './shifts.service.js';
import { CashMovementDto, CloseShiftDto, ListQueryDto, OpenShiftDto } from './shifts.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'cashier')
@Controller('shifts')
export class ShiftsController {
  constructor(private shifts: ShiftsService) {}

  @Get('current')
  current(@CurrentUser() u: CurrentUserPayload) {
    return this.shifts.current(u.cafeId);
  }

  @Post('open')
  open(@CurrentUser() u: CurrentUserPayload, @Body() dto: OpenShiftDto) {
    return this.shifts.open(u.cafeId, dto, u);
  }

  @Post('cash')
  cash(@CurrentUser() u: CurrentUserPayload, @Body() dto: CashMovementDto) {
    return this.shifts.addMovement(u.cafeId, dto, u);
  }

  @Post('close')
  close(@CurrentUser() u: CurrentUserPayload, @Body() dto: CloseShiftDto) {
    return this.shifts.close(u.cafeId, dto, u);
  }

  @Roles('admin')
  @Get()
  list(@CurrentUser() u: CurrentUserPayload, @Query() q: ListQueryDto) {
    return this.shifts.list(u.cafeId, q);
  }

  @Get('expenses')
  expenses(@CurrentUser() u: CurrentUserPayload, @Query() q: ListQueryDto) {
    return this.shifts.listExpenses(u.cafeId, q);
  }

  @Get(':id')
  get(@CurrentUser() u: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.shifts.get(u.cafeId, id);
  }
}
