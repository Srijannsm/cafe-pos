import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export type OrderSentToKitchenEvent = {
  orderId: number;
};

export type OrderItemReadyEvent = {
  orderId: number;
  orderItemId: number;
};

// Broadcasts order-lifecycle events to every connected client *of the same
// cafe* (Kitchen Display, waiter order screens) via a per-cafe Socket.IO
// room. This used to be a plain server.emit() with no rooms -- fine for a
// single cafe, but once a second tenant is on this deployment that would
// leak one cafe's kitchen/order events to every other cafe's screens.
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class OrdersGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  // Same JWT_SECRET as the REST API (JwtService is configured once, in
  // AuthModule, and reused here) -- an unauthenticated or stale token gets
  // disconnected immediately rather than left listening. The verified
  // token's cafeId also decides which room this socket joins, so a client
  // can never end up listening to another cafe's events.
  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`Socket ${client.id} connected with no token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<{ cafeId: number }>(token);
      client.join(cafeRoom(payload.cafeId));
    } catch {
      this.logger.warn(`Socket ${client.id} sent an invalid/expired token`);
      client.disconnect(true);
    }
  }

  emitOrderSentToKitchen(cafeId: number, payload: OrderSentToKitchenEvent) {
    this.server.to(cafeRoom(cafeId)).emit('order.sentToKitchen', payload);
  }

  emitOrderItemReady(cafeId: number, payload: OrderItemReadyEvent) {
    this.server.to(cafeRoom(cafeId)).emit('order.itemReady', payload);
  }
}

function cafeRoom(cafeId: number) {
  return `cafe:${cafeId}`;
}
