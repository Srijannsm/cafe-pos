import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { MenuService } from './menu.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { CreateMenuItemDto } from './dto/create-menu-item.dto.js';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { CreateModifierDto } from './dto/create-modifier.dto.js';
import { UpdateModifierDto } from './dto/update-modifier.dto.js';

@Controller('menu')
export class MenuController {
    constructor(private menuService: MenuService) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    findAll(@CurrentUser() user: CurrentUserPayload){
        return this.menuService.findAll(user.cafeId);
    }

    // Admin management needs to see hidden (isAvailable: false) items too, so it can un-hide them.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('all')
    findAllForAdmin(@CurrentUser() user: CurrentUserPayload) {
        return this.menuService.findAllForAdmin(user.cafeId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('categories')
    findAllCategories(@CurrentUser() user: CurrentUserPayload) {
        return this.menuService.findAllCategories(user.cafeId);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('categories')
    createCategory(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCategoryDto) {
        return this.menuService.createCategory(user.cafeId, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Patch('categories/:id')
    updateCategory(
        @CurrentUser() user: CurrentUserPayload,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCategoryDto,
    ) {
        return this.menuService.updateCategory(user.cafeId, id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post()
    createMenuItem(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateMenuItemDto) {
        return this.menuService.createMenuItem(user.cafeId, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Patch(':id')
    updateMenuItem(
        @CurrentUser() user: CurrentUserPayload,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateMenuItemDto,
    ) {
        return this.menuService.updateMenuItem(user.cafeId, id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Patch(':id/stock')
    adjustStock(
        @CurrentUser() user: CurrentUserPayload,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AdjustStockDto,
    ) {
        return this.menuService.adjustStock(user.cafeId, id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post(':id/modifiers')
    addModifier(
        @CurrentUser() user: CurrentUserPayload,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateModifierDto,
    ) {
        return this.menuService.addModifier(user.cafeId, id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Patch('modifiers/:id')
    updateModifier(
        @CurrentUser() user: CurrentUserPayload,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateModifierDto,
    ) {
        return this.menuService.updateModifier(user.cafeId, id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Delete('modifiers/:id')
    removeModifier(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseIntPipe) id: number) {
        return this.menuService.removeModifier(user.cafeId, id);
    }
}
