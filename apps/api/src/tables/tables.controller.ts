import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { TablesService } from './tables.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { CreateTableDto } from './dto/create-table.dto.js';
import { UpdateTableDto } from './dto/update-table.dto.js';

@Controller('tables')
export class TablesController {
  constructor(private tablesService: TablesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.tablesService.findAll(user.cafeId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  createTable(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateTableDto) {
    return this.tablesService.createTable(user.cafeId, dto);
  }

  // Never accepts a status field — table status is only ever changed by the order lifecycle.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  updateTable(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tablesService.updateTable(user.cafeId, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/regenerate-qr')
  regenerateQr(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
    return this.tablesService.regenerateQr(user.cafeId, id);
  }
}
