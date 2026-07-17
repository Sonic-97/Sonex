import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from '../events/events.service';
import { authenticateSocket, getRoleRoomKey, getRoomKey } from './ws-auth';
import { MetricsService } from '../observability/metrics/metrics.service';

@WebSocketGateway({
  cors: { origin: '*', methods: ['GET', 'POST'] },
  namespace: /\/\w+/,
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AppGateway.name);

  constructor(private readonly metrics: MetricsService) {}

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    if (!authenticateSocket(client)) {
      this.logger.warn(`WS rejected: ${client.id}`);
      client.disconnect();
      return;
    }
    const { cafeId, role } = client.data;
    this.metrics.wsConnections.inc({ cafe: cafeId || 'unknown', role: role || 'unknown' });
    this.logger.log(`WS connected: ${client.id} → cafe:${cafeId} role:${role}`);
  }

  handleDisconnect(client: Socket) {
    const cafeId = client.data?.cafeId;
    const role = client.data?.role;
    this.metrics.wsConnections.dec({ cafe: cafeId || 'unknown', role: role || 'unknown' });
    this.logger.log(`WS disconnected: ${client.id} cafe:${cafeId} role:${role}`);
  }

  private emitToRoom(cafeId: string, event: string, data: AppEvent, roleTarget?: string): void {
    if (!this.server) return;
    const room = roleTarget ? getRoleRoomKey(cafeId, roleTarget) : getRoomKey(cafeId);
    this.server.to(room).emit(event, data);
  }

  private resolveCafeId(event: AppEvent): string | undefined {
    return event.cafeId;
  }

  private broadcastToRoles(cafeId: string, event: string, data: AppEvent, roles: string[]): void {
    if (!this.server || !cafeId) return;
    for (const role of roles) {
      this.server.to(getRoleRoomKey(cafeId, role)).emit(event, data);
    }
  }

  @OnEvent('order.created')
  handleOrderCreated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'order.created', event, ['barista', 'owner']);
  }

  @OnEvent('order.updated')
  handleOrderUpdated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.server.to(getRoomKey(cafeId)).emit('order.updated', event);
  }

  @OnEvent('order.status.changed')
  handleOrderStatusChanged(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    const status = event.payload.status as string;
    this.broadcastToRoles(cafeId, 'order.status.changed', event, ['owner', 'barista']);
    if (['CONFIRMED', 'READY', 'DELIVERED'].includes(status)) {
      this.emitToRoom(cafeId, 'order.status.changed', event, 'driver');
    }
  }

  @OnEvent('order.ready')
  handleOrderReady(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'order.ready', event, ['driver', 'owner']);
  }

  @OnEvent('order.delivered')
  handleOrderDelivered(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'order.delivered', event, ['driver', 'owner']);
  }

  @OnEvent('order.cancelled')
  handleOrderCancelled(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'order.cancelled', event, ['barista', 'owner']);
  }

  @OnEvent('staff.*')
  handleStaffEvent(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.emitToRoom(cafeId, event.eventType, event, 'owner');
  }

  @OnEvent('finance.*')
  handleFinanceEvent(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.emitToRoom(cafeId, event.eventType, event, 'owner');
  }

  @OnEvent('inCafe.order.created')
  handleInCafeOrderCreated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'inCafe.order.created', event, ['barista', 'owner']);
  }

  @OnEvent('inCafe.order.updated')
  handleInCafeOrderUpdated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'inCafe.order.updated', event, ['barista', 'owner']);
  }

  @OnEvent('inCafe.payment.updated')
  handleInCafePaymentUpdated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'inCafe.payment.updated', event, ['barista', 'owner']);
  }

  @OnEvent('staff.purchase.created')
  handleStaffPurchaseCreated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.emitToRoom(cafeId, 'staff.purchase.created', event, 'owner');
  }

  @OnEvent('smart-followup.suggestions.ready')
  handleSmartFollowupReady(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.emitToRoom(cafeId, 'smart-followup.suggestions.ready', event, 'owner');
  }

  @OnEvent('payment.collected')
  handlePaymentCollected(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'payment.collected', event, ['owner', 'barista']);
  }

  @OnEvent('payment.pending')
  handlePaymentPending(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'payment.pending', event, ['owner', 'driver']);
  }

  @OnEvent('payment.updated')
  handlePaymentUpdated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.server.to(getRoomKey(cafeId)).emit('payment.updated', event);
  }

  @OnEvent('product.updated')
  handleProductUpdated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'product.updated', event, ['owner', 'barista']);
  }

  @OnEvent('category.updated')
  handleCategoryUpdated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'category.updated', event, ['owner', 'barista']);
  }

  @OnEvent('inventory.updated')
  handleInventoryUpdated(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'inventory.updated', event, ['owner', 'barista']);
  }

  @OnEvent('low_stock.alert')
  handleLowStockAlert(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.broadcastToRoles(cafeId, 'low_stock.alert', event, ['owner', 'barista']);
  }

  @OnEvent('system.notification')
  handleSystemNotification(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.emitToRoom(cafeId, 'system.notification', event, 'owner');
  }

  @OnEvent('audio.alert')
  handleAudioAlert(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.server.to(getRoomKey(cafeId)).emit('AUDIO_ALERT', event);
  }

  @OnEvent('openwa.alert.critical')
  handleOpenwaCritical(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.emitToRoom(cafeId, 'openwa.alert.critical', event, 'owner');
  }

  @OnEvent('openwa.alert.recovered')
  handleOpenwaRecovered(event: AppEvent) {
    const cafeId = this.resolveCafeId(event);
    if (!cafeId) return;
    this.emitToRoom(cafeId, 'openwa.alert.recovered', event, 'owner');
  }
}
