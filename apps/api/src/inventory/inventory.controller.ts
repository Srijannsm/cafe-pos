import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { InventoryService } from './inventory.service.js';
import { PlanFeatureGuard, RequiresFeature } from '../plans/plan-feature.guard.js';
import {
  CreatePurchaseDto, CreateStockItemDto, MovementsQueryDto, StockCountDto, StockOutDto,
  SupplierDto, UpdateStockItemDto,
} from './dto/inventory.dto.js';

// Admin manages everything; cashiers can record stock-in (a delivery at the
// counter) and stock-out (a broken glass) since they're the ones there.
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeatureGuard)
@RequiresFeature('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Roles('admin', 'cashier')
  @Get('items')
  listItems(@CurrentUser() u: CurrentUserPayload) {
    return this.inventory.listItems(u.cafeId);
  }

  @Roles('admin', 'cashier', 'waiter')
  @Get('low-stock')
  lowStock(@CurrentUser() u: CurrentUserPayload) {
    return this.inventory.lowStockCount(u.cafeId);
  }

  @Roles('admin')
  @Post('items')
  createItem(@CurrentUser() u: CurrentUserPayload, @Body() dto: CreateStockItemDto) {
    return this.inventory.createItem(u.cafeId, dto, u);
  }

  @Roles('admin')
  @Patch('items/:id')
  updateItem(@CurrentUser() u: CurrentUserPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStockItemDto) {
    return this.inventory.updateItem(u.cafeId, id, dto);
  }

  @Roles('admin', 'cashier')
  @Post('stock-out')
  stockOut(@CurrentUser() u: CurrentUserPayload, @Body() dto: StockOutDto) {
    return this.inventory.stockOut(u.cafeId, dto, u);
  }

  @Roles('admin', 'cashier')
  @Post('purchases')
  createPurchase(@CurrentUser() u: CurrentUserPayload, @Body() dto: CreatePurchaseDto) {
    return this.inventory.createPurchase(u.cafeId, dto, u);
  }

  @Roles('admin', 'cashier')
  @Get('purchases')
  listPurchases(@CurrentUser() u: CurrentUserPayload, @Query() q: MovementsQueryDto) {
    return this.inventory.listPurchases(u.cafeId, q);
  }

  @Roles('admin')
  @Post('counts')
  postCount(@CurrentUser() u: CurrentUserPayload, @Body() dto: StockCountDto) {
    return this.inventory.postCount(u.cafeId, dto, u);
  }

  @Roles('admin', 'cashier')
  @Get('movements')
  listMovements(@CurrentUser() u: CurrentUserPayload, @Query() q: MovementsQueryDto) {
    return this.inventory.listMovements(u.cafeId, q);
  }

  @Roles('admin', 'cashier')
  @Get('suppliers')
  listSuppliers(@CurrentUser() u: CurrentUserPayload) {
    return this.inventory.listSuppliers(u.cafeId);
  }

  @Roles('admin')
  @Post('suppliers')
  createSupplier(@CurrentUser() u: CurrentUserPayload, @Body() dto: SupplierDto) {
    return this.inventory.createSupplier(u.cafeId, dto);
  }

  @Roles('admin')
  @Patch('suppliers/:id')
  updateSupplier(@CurrentUser() u: CurrentUserPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: SupplierDto) {
    return this.inventory.updateSupplier(u.cafeId, id, dto);
  }
}
