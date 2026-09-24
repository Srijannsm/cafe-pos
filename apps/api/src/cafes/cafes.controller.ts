import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CafesService } from './cafes.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';

// Deliberately unauthenticated: a device hasn't logged in yet when it needs
// these, since knowing which cafe you're talking to is a precondition for
// login itself, not something login produces.
@Controller('cafes')
export class CafesController {
  constructor(private cafesService: CafesService) {}

  /** Returns the authenticated user's cafe's plan and feature flags. */
  @UseGuards(JwtAuthGuard)
  @Get('my-plan')
  getMyPlan(@CurrentUser() user: CurrentUserPayload) {
    return this.cafesService.getPlanInfo(user.cafeId);
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.cafesService.findPublicBySlug(slug);
  }

  @Get(':slug/staff')
  findStaffForLogin(@Param('slug') slug: string) {
    return this.cafesService.findStaffForLogin(slug);
  }
}
