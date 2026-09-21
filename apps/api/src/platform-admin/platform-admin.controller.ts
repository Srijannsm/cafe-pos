import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { CreateCafeDto } from './dto/create-cafe.dto.js';
import { UpdateCafeDto } from './dto/update-cafe.dto.js';

@UseGuards(PlatformAdminGuard)
@Controller('platform/cafes')
export class PlatformAdminController {
  constructor(private platformAdminService: PlatformAdminService) {}

  @Get()
  findAll() {
    return this.platformAdminService.findAllCafes();
  }

  @Post()
  create(@Body() dto: CreateCafeDto) {
    return this.platformAdminService.createCafe(dto);
  }

  @Patch(':id')
  setActive(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCafeDto) {
    return this.platformAdminService.setActive(id, dto);
  }
}
