import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { authenticateSocket, getRoleRoomKey, getRoomKey } from '../websocket/ws-auth';

interface NotificationEvent {
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
  cafeId?: string;
}

@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  namespace: /\/\w+/,
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    if (!authenticateSocket(client)) {
      this.logger.warn(`Notification WS rejected: ${client.id}`);
      client.disconnect();
      return;
    }
    const { cafeId, role } = client.data;
    this.logger.log(`Notification WS connected: ${client.id} → cafe:${cafeId} role:${role}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Notification WS disconnected: ${client.id}`);
  }

  private resolveCafeId(event: NotificationEvent): string | undefined {
    return event.cafeId || ((event.payload as any)?.cafeId as string);
  }

  @OnEvent('notification.created')
  handleNotificationCreated(event: NotificationEvent) {
    if (!this.server) return;
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;

    const payload = event.payload as any;
    const roleTarget = payload?.roleTarget;

    if (roleTarget === 'ALL' || roleTarget === 'Cafe') {
      this.server.to(getRoomKey(cafeId)).emit('notification.created', event);
    }
    if (roleTarget === 'ALL' || roleTarget === 'BARISTA') {
      this.server.to(getRoleRoomKey(cafeId, 'barista')).emit('notification.created', event);
    }
    if (roleTarget === 'ALL' || roleTarget === 'DRIVER') {
      this.server.to(getRoleRoomKey(cafeId, 'driver')).emit('notification.created', event);
    }
    if (payload?.userId) {
      this.server.to(getRoomKey(cafeId)).emit('notification.created', event);
    }
  }

  @OnEvent('notification.read')
  handleNotificationRead(event: NotificationEvent) {
    if (!this.server) return;
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    const { notificationId } = event.payload as any;
    this.server.to(getRoomKey(cafeId)).emit('notification.read', { notificationId });
  }

  @OnEvent('notification.read-all')
  handleNotificationReadAll(event: NotificationEvent) {
    if (!this.server) return;
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    const { userId, count } = event.payload as any;
    this.server.to(getRoomKey(cafeId)).emit('notification.read-all', { userId, updatedCount: count });
  }

  @OnEvent('notification.deleted')
  handleNotificationDeleted(event: NotificationEvent) {
    if (!this.server) return;
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    const { notificationId } = event.payload as any;
    this.server.to(getRoomKey(cafeId)).emit('notification.deleted', { notificationId });
  }
}
