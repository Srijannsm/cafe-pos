import { Body, Controller, Post, Param, ParseIntPipe, Patch, Delete, UseGuards, Get, Query } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AddOrderDto } from './dto/add-item.dto.js';
import { RecordPaymentDto } from './dto/record-payment.dto.js';
import { UpdateOrderNotesDto } from './dto/update-order-notes.dto.js';
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
  @Roles('waiter', 'admin')
  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.cafeId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Post(':orderId/items')
  addItem(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: AddOrderDto,
  ) {
    return this.ordersService.addItem(user.cafeId, orderId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Delete('items/:orderItemId')
  removeItem(@CurrentUser() user: CurrentUserPayload, @Param('orderItemId', ParseIntPipe) orderItemId: number) {
    return this.ordersService.removeItem(user.cafeId, orderItemId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Patch(':orderId/send-to-kitchen')
  sendToKitchen(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.sendToKitchen(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Patch('items/:orderItemId/ready')
  markItemReady(@CurrentUser() user: CurrentUserPayload, @Param('orderItemId', ParseIntPipe) orderItemId: number) {
    return this.ordersService.markItemReady(user.cafeId, orderItemId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Patch(':orderId/serve')
  serve(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.serve(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Patch(':orderId/cancel')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.cancel(user.cafeId, orderId);
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
    return this.ordersService.reopenToServed(user.cafeId, orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'cashier')
  @Patch(':orderId/pay')
  recordPayment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.ordersService.recordPayment(user.cafeId, orderId, dto);
  }

  @UseGuards(JwtAuthGuard)
@Get(':orderId')
findOne(@CurrentUser() user: CurrentUserPayload, @Param('orderId', ParseIntPipe) orderId: number) {
  return this.ordersService.findOne(user.cafeId, orderId);
}


  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Patch(':orderId/notes')
  updateNotes(
    @CurrentUser() user: CurrentUserPayload,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderNotesDto,
  ) {
    return this.ordersService.updateNotes(user.cafeId, orderId, dto);
  }

}