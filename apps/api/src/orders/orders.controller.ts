import { Body, Controller, Post, Param, ParseIntPipe, Patch, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { AddOrderDto } from './dto/add-item.dto.js';
import { RecordPaymentDto } from './dto/record-payment.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';

@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Post(':orderId/items')
  addItem(@Param('orderId', ParseIntPipe) orderId: number, @Body() dto: AddOrderDto) {
    return this.ordersService.addItem(orderId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Patch(':orderId/send-to-kitchen')
  sendToKitchen(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.sendToKitchen(orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Patch('items/:orderItemId/ready')
  markItemReady(@Param('orderItemId', ParseIntPipe) orderItemId: number) {
    return this.ordersService.markItemReady(orderItemId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('waiter', 'admin')
  @Patch(':orderId/serve')
  serve(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.serve(orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'cashier')
  @Patch(':orderId/bill')
  generateBill(@Param('orderId', ParseIntPipe) orderId: number) {
    return this.ordersService.generateBill(orderId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'cashier')
  @Patch(':orderId/pay')
  recordPayment(@Param('orderId', ParseIntPipe) orderId: number, @Body() dto: RecordPaymentDto) {
    return this.ordersService.recordPayment(orderId, dto);
  }

}