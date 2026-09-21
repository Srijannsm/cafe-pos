import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicOrderingService } from './public-ordering.service.js';
import { PlaceOrderDto } from './dto/place-order.dto.js';

// Deliberately unauthenticated -- the qrToken itself is the capability.
// Anyone with the link can view the menu and add items for that table,
// which is the intended trust model for a QR-scanned self-ordering flow.
@Controller('public/tables')
export class PublicOrderingController {
  constructor(private readonly publicOrderingService: PublicOrderingService) {}

  @Get(':qrToken')
  getTableForOrdering(@Param('qrToken') qrToken: string) {
    return this.publicOrderingService.getTableForOrdering(qrToken);
  }

  @Post(':qrToken/order')
  placeOrder(@Param('qrToken') qrToken: string, @Body() dto: PlaceOrderDto) {
    return this.publicOrderingService.placeOrder(qrToken, dto);
  }
}
