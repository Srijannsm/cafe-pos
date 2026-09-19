import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { MenuService } from './menu.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { CreateMenuItemDto } from './dto/create-menu-item.dto.js';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { CreateModifierDto } from './dto/create-modifier.dto.js';
import { UpdateModifierDto } from './dto/update-modifier.dto.js';

@Controller('menu')
export class MenuController {
    constructor(private menuService: MenuService) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    findAll(){
        return this.menuService.findAll();
    }

    // Admin management needs to see hidden (isAvailable: false) items too, so it can un-hide them.
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Get('all')
    findAllForAdmin() {
        return this.menuService.findAllForAdmin();
    }

    @UseGuards(JwtAuthGuard)
    @Get('categories')
    findAllCategories() {
        return this.menuService.findAllCategories();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post('categories')
    createCategory(@Body() dto: CreateCategoryDto) {
        return this.menuService.createCategory(dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Patch('categories/:id')
    updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
        return this.menuService.updateCategory(id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post()
    createMenuItem(@Body() dto: CreateMenuItemDto) {
        return this.menuService.createMenuItem(dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Patch(':id')
    updateMenuItem(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMenuItemDto) {
        return this.menuService.updateMenuItem(id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Post(':id/modifiers')
    addModifier(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateModifierDto) {
        return this.menuService.addModifier(id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Patch('modifiers/:id')
    updateModifier(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateModifierDto) {
        return this.menuService.updateModifier(id, dto);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('admin')
    @Delete('modifiers/:id')
    removeModifier(@Param('id', ParseIntPipe) id: number) {
        return this.menuService.removeModifier(id);
    }
}
