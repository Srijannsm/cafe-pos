import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PublicOrderingService } from './public-ordering.service.js';
import { PlaceOrderDto, TableRequestDto } from './dto/place-order.dto.js';

// Deliberately unauthenticated -- the qrToken itself is the capability.
@Controller('public/tables')
export class PublicOrderingController {
  constructor(private readonly publicOrderingService: PublicOrderingService) {}

  @Get(':qrToken')
  getTableForOrdering(@Param('qrToken') qrToken: string) {
    return this.publicOrderingService.getTableForOrdering(qrToken);
  }

  @Get(':qrToken/status')
  getStatus(@Param('qrToken') qrToken: string) {
    return this.publicOrderingService.getStatus(qrToken);
  }

  @Post(':qrToken/order')
  placeOrder(@Param('qrToken') qrToken: string, @Body() dto: PlaceOrderDto) {
    return this.publicOrderingService.placeOrder(qrToken, dto);
  }

  @Post(':qrToken/request')
  request(@Param('qrToken') qrToken: string, @Body() dto: TableRequestDto) {
    return this.publicOrderingService.createRequest(qrToken, dto);
  }
}
