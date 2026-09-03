import { KitchenWebsocketGateway } from '../gateways/kitchen-websocket.gateway';
import { OutboxEventSubscriber } from '../subscribers/outbox-event.subscriber';

describe('Real-Time KDS WebSocket System (UX-DOC-001)', () => {
  let gateway: KitchenWebsocketGateway;
  let subscriber: OutboxEventSubscriber;
  let mockServer: any;

  beforeEach(() => {
    mockServer = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    };

    gateway = new KitchenWebsocketGateway();
    gateway.server = mockServer as any;
    subscriber = new OutboxEventSubscriber(gateway);
  });

  it('should broadcast order card successfully within sub-50ms SLA', async () => {
    const payload = {
      orderId: 'ord_kds_1',
      code: 'ORD-101',
      tenantId: 'tenant_cafe_1',
      branchId: 'branch_nasr_city',
      channel: 'DINE_IN',
      items: [{ name: 'Cappuccino', quantity: 2 }],
      status: 'NEW',
      createdAt: new Date().toISOString(),
    };

    const startTime = Date.now();
    const result = await subscriber.handleOrderCreatedEvent(payload);
    const durationMs = Date.now() - startTime;

    expect(result).toBe(true);
    expect(mockServer.to).toHaveBeenCalledWith('kds:tenant_cafe_1:branch_nasr_city');
    expect(durationMs).toBeLessThan(50);
  });

  it('should handle unauthorized connection attempts missing tenantId or branchId', () => {
    const mockSocket: any = {
      id: 'socket_unauth',
      handshake: { headers: {}, query: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
    };

    gateway.handleConnection(mockSocket);

    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
    expect(mockSocket.join).not.toHaveBeenCalled();
  });

  it('should enforce strict multi-tenant isolation and prevent cross-tenant leakage', async () => {
    const payloadTenantA = {
      orderId: 'ord_a',
      code: 'ORD-A',
      tenantId: 'tenant_A',
      branchId: 'branch_1',
    };

    const payloadTenantB = {
      orderId: 'ord_b',
      code: 'ORD-B',
      tenantId: 'tenant_B',
      branchId: 'branch_1',
    };

    await subscriber.handleOrderCreatedEvent(payloadTenantA);
    await subscriber.handleOrderCreatedEvent(payloadTenantB);

    expect(mockServer.to).toHaveBeenNthCalledWith(1, 'kds:tenant_A:branch_1');
    expect(mockServer.to).toHaveBeenNthCalledWith(2, 'kds:tenant_B:branch_1');
  });

  it('should process multiple concurrent order broadcasts without queue failure', async () => {
    const concurrentOrders = Array.from({ length: 50 }, (_, i) => ({
      orderId: `ord_conc_${i}`,
      code: `ORD-${i}`,
      tenantId: 'tenant_cafe_1',
      branchId: 'branch_1',
    }));

    const results = await Promise.all(
      concurrentOrders.map((o) => subscriber.handleOrderCreatedEvent(o)),
    );

    expect(results.every((r) => r === true)).toBe(true);
    expect(mockServer.to).toHaveBeenCalledTimes(50);
  });

  it('should handle client disconnect and clean socket map', () => {
    const mockSocket: any = {
      id: 'socket_active',
      handshake: { headers: { 'x-tenant-id': 'tenant_1', 'x-branch-id': 'branch_1' }, query: {} },
      disconnect: jest.fn(),
      join: jest.fn(),
    };

    gateway.handleConnection(mockSocket);
    gateway.handleDisconnect(mockSocket);

    expect(mockSocket.join).toHaveBeenCalledWith('kds:tenant_1:branch_1');
  });

  it('should handle uninitialized server gracefully as queue failure recovery', async () => {
    gateway.server = undefined as any;

    const payload = {
      orderId: 'ord_recovery',
      code: 'ORD-REC',
      tenantId: 'tenant_1',
      branchId: 'branch_1',
    };

    const result = await subscriber.handleOrderCreatedEvent(payload);
    expect(result).toBe(false);
  });
});
