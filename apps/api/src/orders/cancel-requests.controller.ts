import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { CancelRequestsService } from './cancel-requests.service.js';
import { CreateCancelRequestDto } from './dto/cancel-request.dto.js';

@Controller('cancel-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CancelRequestsController {
  constructor(private requests: CancelRequestsService) {}

  // Any staff member can ask (an admin's request is approved at once).
  @Post()
  @Roles('waiter', 'cashier', 'admin')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCancelRequestDto) {
    return this.requests.request(user.cafeId, dto.orderId, dto.reason, user);
  }

  @Post(':id/approve')
  @Roles('admin')
  approve(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.requests.decide(user.cafeId, id, true, user);
  }

  @Post(':id/reject')
  @Roles('admin')
  reject(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.requests.decide(user.cafeId, id, false, user);
  }
}
