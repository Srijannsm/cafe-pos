import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  // Scoped by the cafeId in the JWT, like every other tenant endpoint.
  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.notifications.list(user.cafeId, user.role);
  }
}
