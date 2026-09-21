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

// Broadcasts order-lifecycle events to every connected client (Kitchen Display,
// waiter order screens). No rooms/namespaces -- a single cafe has a handful of
// concurrent clients, so a plain broadcast is simpler than per-table channels
// and cheap enough to leave that way until it's actually a problem.
@WebSocketGateway({
  cors: { origin: 'http://localhost:3000', credentials: true },
})
export class OrdersGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  // Same JWT_SECRET as the REST API (JwtService is configured once, in
  // AuthModule, and reused here) -- an unauthenticated or stale token gets
  // disconnected immediately rather than left listening.
  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`Socket ${client.id} connected with no token`);
      client.disconnect(true);
      return;
    }

    try {
      this.jwtService.verify(token);
    } catch {
      this.logger.warn(`Socket ${client.id} sent an invalid/expired token`);
      client.disconnect(true);
    }
  }

  emitOrderSentToKitchen(payload: OrderSentToKitchenEvent) {
    this.server.emit('order.sentToKitchen', payload);
  }

  emitOrderItemReady(payload: OrderItemReadyEvent) {
    this.server.emit('order.itemReady', payload);
  }
}
