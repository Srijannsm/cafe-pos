import { Controller, Get, Param } from '@nestjs/common';
import { CafesService } from './cafes.service.js';

// Deliberately unauthenticated: a device hasn't logged in yet when it needs
// these, since knowing which cafe you're talking to is a precondition for
// login itself, not something login produces.
@Controller('cafes')
export class CafesController {
  constructor(private cafesService: CafesService) {}

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.cafesService.findPublicBySlug(slug);
  }

  @Get(':slug/staff')
  findStaffForLogin(@Param('slug') slug: string) {
    return this.cafesService.findStaffForLogin(slug);
  }
}
