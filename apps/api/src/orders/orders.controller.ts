import { Body, Controller, Post, Param, ParseIntPipe, Patch, Delete, UseGuards, Get, Query } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AddOrderDto } from './dto/add-item.dto.js';
import { AddPaymentDto, RecordPaymentDto } from './dto/record-payment.dto.js';
import { UpdateOrderNotesDto } from './dto/update-order-notes.dto.js';
import { ApplyDiscountDto, OptionalReasonDto, ReasonDto } from './dto/billing.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserPayload } from '../auth/current-user.decorator.js';
import { OrderStatus } from '../generated/prisma/client.js';

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload, @Query('status') status?: OrderStatus) {
    return this.ordersService.findAll(user.cafeId, status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.cafeId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Post(':orderId/items')
  addItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: AddOrderDto,
  ) {
    return this.ordersService.addItem(user.cafeId, orderId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Delete('items/:orderItemId')
  removeItem(@CurrentUser() user: CurrentUserPayload, @Param('orderItemId', ParseIntPipe) orderItemId: number) {
    return this.ordersService.removeItem(user.cafeId, orderItemId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch('items/:orderItemId/void')
  voidItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderItemId', ParseIntPipe) orderItemId: number,
    @Body() dto: ReasonDto,
  ) {
    return this.ordersService.voidItem(user.cafeId, orderItemId, dto.reason, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':orderId/send-to-kitchen')
  sendToKitchen(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.sendToKitchen(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch('items/:orderItemId/ready')
  markItemReady(@CurrentUser() user: CurrentUserPayload, @Param('orderItemId', ParseIntPipe) orderItemId: number) {
    return this.ordersService.markItemReady(user.cafeId, orderItemId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch('items/:orderItemId/recall')
  recallItem(@CurrentUser() user: CurrentUserPayload, @Param('orderItemId', ParseIntPipe) orderItemId: number) {
    return this.ordersService.recallItem(user.cafeId, orderItemId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':orderId/serve')
  serve(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.serve(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':orderId/cancel')
  cancel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: OptionalReasonDto,
  ) {
    return this.ordersService.cancel(user.cafeId, orderId, user, dto?.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':orderId/estimate')
  estimate(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.estimate(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'cashier')
  @Patch(':orderId/discount')
  applyDiscount(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.ordersService.applyDiscount(user.cafeId, orderId, dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':orderId/bill')
  generateBill(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.generateBill(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':orderId/reopen')
  reopen(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.reopenToServed(user.cafeId, orderId, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':orderId/printed')
  markPrinted(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.markPrinted(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'cashier')
  @Patch(':orderId/pay')
  recordPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.ordersService.recordPayment(user.cafeId, orderId, dto, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'cashier')
  @Post(':orderId/payments')
  addPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: AddPaymentDto,
  ) {
    return this.ordersService.addPayment(user.cafeId, orderId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':orderId')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.findOne(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':orderId/notes')
  updateNotes(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderNotesDto,
  ) {
    return this.ordersService.updateNotes(user.cafeId, orderId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':sourceOrderId/merge-into/:targetOrderId')
  mergeInto(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sourceOrderId', ParseIntPipe) sourceOrderId: number,
    @Param('targetOrderId', ParseIntPipe) targetOrderId: number,
  ) {
    return this.ordersService.mergeInto(user.cafeId, sourceOrderId, targetOrderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin', 'cashier')
  @Patch(':orderId/move-to-table/:tableId')
  moveToTable(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('tableId', ParseIntPipe) tableId: number,
  ) {
    return this.ordersService.moveToTable(user.cafeId, orderId, tableId);
  }
}
