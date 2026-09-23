import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformJwtAuthGuard } from '../platform-auth/platform-jwt-auth.guard.js';
import { CreateCafeDto } from './dto/create-cafe.dto.js';
import { UpdateCafeDto } from './dto/update-cafe.dto.js';

@UseGuards(PlatformJwtAuthGuard)
@Controller('platform')
export class PlatformAdminController {
  constructor(private platformAdminService: PlatformAdminService) {}

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
}
