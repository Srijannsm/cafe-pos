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
// cafe* (Kitchen Display, waiter order screens, floor view, billing) via a
// per-cafe Socket.IO room, so one tenant never sees another's events.
//
// Event catalogue:
//   order.sentToKitchen  -- KDS gets a new/updated ticket
//   order.itemReady      -- waiter screen shows "ready to serve"
//   order.itemVoided     -- KDS strikes the item through
//   floor.changed        -- tables/billing refetch (replaces 15s polling)
//   qr.orderPlaced       -- a customer submitted from the table QR
//   table.request        -- "Call waiter" / "Request bill" tapped
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class OrdersGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  handleConnection(client: Socket) {
    // The games namespace authenticates on its own (qrToken, not a staff JWT).
    if (client.nsp.name !== '/') return;
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
    this.emitFloorChanged(cafeId);
  }

  emitOrderItemReady(cafeId: number, payload: OrderItemReadyEvent) {
    this.server.to(cafeRoom(cafeId)).emit('order.itemReady', payload);
  }

  emitCafe(cafeId: number, event: string, payload: unknown) {
    this.server?.to(cafeRoom(cafeId)).emit(event, payload);
  }

  emitFloorChanged(cafeId: number) {
    this.server?.to(cafeRoom(cafeId)).emit('floor.changed', { at: Date.now() });
  }
}

function cafeRoom(cafeId: number) {
  return `cafe:${cafeId}`;
}
