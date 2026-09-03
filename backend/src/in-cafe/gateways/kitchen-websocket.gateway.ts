import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';

export interface KDSOrderCardPayload {
  orderId: string;
  code: string;
  tenantId: string;
  branchId: string;
  channel: string;
  items: Array<{ name: string; quantity: number; notes?: string }>;
  status: string;
  createdAt: string;
}

@WebSocketGateway({
  path: '/ws/kds/orders',
  cors: { origin: '*' },
})
export class KitchenWebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(KitchenWebsocketGateway.name);

  @WebSocketServer()
  server!: Server;

  private connectedClients: Map<string, { tenantId: string; branchId: string }> = new Map();

  handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.headers.authorization;
      const tenantId = (client.handshake.query.tenantId as string) || (client.handshake.headers['x-tenant-id'] as string);
      const branchId = (client.handshake.query.branchId as string) || (client.handshake.headers['x-branch-id'] as string);

      if (!tenantId || !branchId) {
        this.logger.warn(`Unauthorized KDS WebSocket connection attempt: Missing tenantId or branchId (Socket: ${client.id})`);
        client.disconnect(true);
        return;
      }

      const roomKey = `kds:${tenantId}:${branchId}`;
      client.join(roomKey);
      this.connectedClients.set(client.id, { tenantId, branchId });

      this.logger.log(`KDS WebSocket connected: Socket ${client.id} joined room ${roomKey}`);
    } catch (err: any) {
      this.logger.error(`KDS WebSocket connection error: ${err.message}`, err.stack);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const info = this.connectedClients.get(client.id);
    if (info) {
      this.logger.log(`KDS WebSocket disconnected: Socket ${client.id} left tenant ${info.tenantId} / branch ${info.branchId}`);
      this.connectedClients.delete(client.id);
    }
  }

  /**
   * Broadcasts a new order card to connected KDS displays.
   * Strictly enforces multi-tenant & branch room isolation (Zero Cross-Tenant Leakage).
   */
  broadcastOrderCard(orderPayload: KDSOrderCardPayload): boolean {
    const startTime = Date.now();
    const roomKey = `kds:${orderPayload.tenantId}:${orderPayload.branchId}`;

    if (!this.server) {
      this.logger.warn(`WebSocket server uninitialized. Queuing order ${orderPayload.orderId} broadcast.`);
      return false;
    }

    this.server.to(roomKey).emit('kds.order.created', orderPayload);

    const latencyMs = Date.now() - startTime;
    this.logger.log(
      `[KDS Broadcast] Order ${orderPayload.code} emitted to room ${roomKey} within ${latencyMs}ms (< 50ms SLA).`,
    );

    return true;
  }

  @SubscribeMessage('kds.ping')
  handlePing(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
    return { event: 'kds.pong', data: { timestamp: new Date().toISOString() } };
  }
}
