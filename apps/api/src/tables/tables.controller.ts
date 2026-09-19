import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { TablesService } from './tables.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateTableDto } from './dto/create-table.dto.js';
import { UpdateTableDto } from './dto/update-table.dto.js';

@Controller('tables')
export class TablesController {
  constructor(private tablesService: TablesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.tablesService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  createTable(@Body() dto: CreateTableDto) {
    return this.tablesService.createTable(dto);
  }

  // Never accepts a status field — table status is only ever changed by the order lifecycle.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  updateTable(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTableDto) {
    return this.tablesService.updateTable(id, dto);
  }
}
