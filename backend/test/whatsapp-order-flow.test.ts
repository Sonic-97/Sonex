import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { Server } from 'socket.io';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService, AppEvent } from '../src/events/events.service';

class ServerIoAdapter extends IoAdapter {
  create(port: number, options?: any) {
    const { namespace, server, ...opt } = options || {};
    let io: Server;
    if (server && typeof server.of === 'function') {
      io = server as Server;
    } else if (this.httpServer && port === 0) {
      io = new Server(this.httpServer, opt);
    } else {
      io = new Server(port, opt);
    }
    if (namespace) io.of(namespace);
    return io;
  }
}

function makePhone(): string {
  const rand = Math.floor(10000000 + Math.random() * 90000000);
  return `+2010${rand}`;
}

function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) return resolve();
    socket.on('connect', () => resolve());
    socket.on('connect_error', (err) => reject(err));
    setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
  });
}

describe('E2E: WhatsApp Order Integration & Lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let eventsService: EventsService;
  let port: number;
  let authToken: string;
  function authedPost(path: string) {
    return request(app.getHttpServer()).post(path).set('Authorization', 'Bearer ' + authToken);
  }

  const capturedEvents: AppEvent[] = [];
  let baristaSocket: ClientSocket;
  let ownerSocket: ClientSocket;
  const baristaEvents: AppEvent[] = [];
  const ownerEvents: AppEvent[] = [];

  let testMintTeaProduct: any;
  let testLatteProduct: any;
  let defaultBranchId: string;
  let defaultCafeId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new ServerIoAdapter(app));
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

    prisma = app.get(PrismaService);
    eventsService = app.get(EventsService);

    const defaultBranch = await prisma.branch.findFirst({
      where: { slug: 'main-branch' },
      select: { id: true, cafeId: true },
    });
    defaultBranchId = defaultBranch?.id || '';
    defaultCafeId = defaultBranch?.cafeId || '';

    const jwtService = app.get(JwtService);
    const staffUser = await prisma.staff.findFirst({ where: { loginCode: { not: null } } });
    authToken = jwtService.sign(
      { sub: staffUser.id, role: staffUser.role, phone: staffUser.phone, branchId: staffUser.branchId, cafeId: staffUser.cafeId },
      { secret: process.env.JWT_ACCESS_SECRET || 'fallback-secret', expiresIn: '1h' },
    );

    // Capture EventEmitter2 events
    const originalEmit = eventsService.emit.bind(eventsService);
    jest.spyOn(eventsService, 'emit').mockImplementation((eventType, payload) => {
      capturedEvents.push(eventsService.normalize(eventType, payload));
      return originalEmit(eventType, payload);
    });

    await app.init();
    await app.listen(0);
    port = (app.getHttpServer() as any).address().port;

    // Connect mock sockets
    baristaSocket = ioc(`http://localhost:${port}/barista`, {
      transports: ['websocket'],
      reconnection: false,
    });
    ownerSocket = ioc(`http://localhost:${port}/Cafe`, {
      transports: ['websocket'],
      reconnection: false,
    });

    await Promise.all([
      waitForConnect(baristaSocket),
      waitForConnect(ownerSocket),
    ]);

    baristaSocket.onAny((eventName, ...args) => {
      baristaEvents.push(args[0] as AppEvent);
    });
    ownerSocket.onAny((eventName, ...args) => {
      ownerEvents.push(args[0] as AppEvent);
    });

    // Match or create products for testing
    testMintTeaProduct = await prisma.product.findFirst({
      where: { name: 'شاي بالنعناع', active: true },
    });
    if (!testMintTeaProduct) {
      testMintTeaProduct = await prisma.product.create({
        data: {
          name: 'شاي بالنعناع',
          category: 'مشروبات ساخنة',
          price: 10,
          cost: 3,
          active: true,
          branchId: defaultBranchId,
          cafeId: defaultCafeId,
        },
      });
    }

    testLatteProduct = await prisma.product.findFirst({
      where: { name: 'لاتيه', active: true },
    });
    if (!testLatteProduct) {
      testLatteProduct = await prisma.product.create({
        data: {
          name: 'لاتيه',
          category: 'coffee',
          price: 25,
          cost: 10,
          active: true,
          branchId: defaultBranchId,
          cafeId: defaultCafeId,
        },
      });
    }
  }, 30000);

  afterAll(async () => {
    baristaSocket?.disconnect();
    ownerSocket?.disconnect();
    jest.restoreAllMocks();
    await app.close();
  });

  beforeEach(() => {
    capturedEvents.length = 0;
    baristaEvents.length = 0;
    ownerEvents.length = 0;
  });

  // ─────────────────────────────────────────────
  // Phase 4 & 5: Complete Integration Test Scenario
  // ─────────────────────────────────────────────

  describe('Successful E2E WhatsApp Order Flow', () => {
    it('should process Arabic WhatsApp order, parse it via AI, create a database order, emit event, and broadcast to sockets', async () => {
      const phone = makePhone();
      const messageId = `msg-success-${Date.now()}`;
      
      // Step 1 & 2: Simulate Inbound WhatsApp Webhook call
      const response = await request(app.getHttpServer())
        .post('/communication/webhook/whatsapp')
        .send({
          phone,
          message: 'عايز 2 شاي بالنعناع و 1 لاتيه دليفري',
          messageId,
          cafeId: defaultCafeId,
        })
        .expect(201);

      expect(response.body.status).toBe('flow_reply');
      expect(response.body.reply).toContain('تم استلام طلبك بنجاح');

      // Step 3: Verify Order in Database
      const customer = await prisma.customer.findUnique({
        where: {
          cafeId_branchId_phone: {
            cafeId: defaultCafeId,
            branchId: defaultBranchId,
            phone,
          },
        },
      });
      expect(customer).toBeDefined();

      const order = await prisma.order.findFirst({
        where: { customerId: customer.id },
        include: { items: { include: { product: true } } },
      });
      expect(order).toBeDefined();
      expect(order.source).toBe('WHATSAPP');
      expect(order.status).toBe('NEW');
      expect(order.type).toBe('DELIVERY');
      expect(order.items.length).toBe(2);

      // Verify exact items mapped
      const teaItem = order.items.find(i => i.product.name === 'شاي بالنعناع' || i.product.name === 'Mint Tea');
      expect(teaItem).toBeDefined();
      expect(teaItem.quantity).toBe(2);

      const latteItem = order.items.find(i => i.product.name === 'لاتيه' || i.product.name === 'Latte');
      expect(latteItem).toBeDefined();
      expect(latteItem.quantity).toBe(1);

      // Step 4: Verify Event Emission on Backend
      const createdEvent = capturedEvents.find(e => e.eventType === 'order.created');
      expect(createdEvent).toBeDefined();
      expect((createdEvent.payload as any).orderId).toBe(order.id);
      expect((createdEvent.payload as any).source).toBe('WHATSAPP');

      // Step 5 & 6: Verify WebSocket Broadcast & Barista Reception
      await new Promise(r => setTimeout(r, 100)); // wait for websocket dispatch
      
      const baristaReceived = baristaEvents.find(e => e.eventType === 'order.created');
      expect(baristaReceived).toBeDefined();
      expect((baristaReceived.payload as any).orderId).toBe(order.id);
      expect((baristaReceived.payload as any).source).toBe('WHATSAPP');

      const ownerReceived = ownerEvents.find(e => e.eventType === 'order.created');
      expect(ownerReceived).toBeDefined();
      expect((ownerReceived.payload as any).source).toBe('WHATSAPP');
    });
  });

  // ─────────────────────────────────────────────
  // Phase 6: Negative Cases & Edge Cases
  // ─────────────────────────────────────────────

  describe('Negative Cases and Edge Cases', () => {
    it('should reject WhatsApp order with invalid products and return inquiry/help response without creating order', async () => {
      const phone = makePhone();
      const messageId = `msg-invalid-prod-${Date.now()}`;

      const response = await request(app.getHttpServer())
        .post('/communication/webhook/whatsapp')
        .send({
          phone,
          message: 'عايز 2 XYZ', // Product does not exist
          messageId,
          cafeId: defaultCafeId,
        })
        .expect(201);

      expect(response.body.status).toBe('flow_reply');
      // Should fall back to rule-based welcoming/category message since AI doesn't match product
      expect(response.body.reply).not.toContain('تم استلام طلبك بنجاح');

      // Check DB - no order created
      const customer = await prisma.customer.findUnique({
        where: {
          cafeId_branchId_phone: {
            cafeId: defaultCafeId,
            branchId: defaultBranchId,
            phone,
          },
        },
      });
      if (customer) {
        const orders = await prisma.order.findMany({ where: { customerId: customer.id } });
        expect(orders).toHaveLength(0);
      }

      // No order.created event
      const createdEvent = capturedEvents.find(e => e.eventType === 'order.created');
      expect(createdEvent).toBeUndefined();
    });

    it('should handle AI parsing failures/garbage text gracefully by falling back to greeting rather than crashing', async () => {
      const phone = makePhone();
      const messageId = `msg-garbage-${Date.now()}`;

      const response = await request(app.getHttpServer())
        .post('/communication/webhook/whatsapp')
        .send({
          phone,
          message: 'hjkdhsjkdhsk',
          messageId,
          cafeId: defaultCafeId,
        })
        .expect(201);

      expect(response.body.status).toBe('flow_reply');
      expect(response.body.reply).toContain('تحب تطلب جديد'); // Start flow welcome message

      // No order created
      const customer = await prisma.customer.findUnique({
        where: {
          cafeId_branchId_phone: {
            cafeId: defaultCafeId,
            branchId: defaultBranchId,
            phone,
          },
        },
      });
      if (customer) {
        const orders = await prisma.order.findMany({ where: { customerId: customer.id } });
        expect(orders).toHaveLength(0);
      }
    });

    it('should handle concurrent WhatsApp orders successfully with separate codes and sources', async () => {
      const phone1 = makePhone();
      const phone2 = makePhone();

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/communication/webhook/whatsapp')
          .send({ phone: phone1, message: 'عايز 1 شاي بالنعناع', messageId: `msg-c1-${Date.now()}`, cafeId: defaultCafeId }),
        request(app.getHttpServer())
          .post('/communication/webhook/whatsapp')
          .send({ phone: phone2, message: 'عايز 1 لاتيه', messageId: `msg-c2-${Date.now()}`, cafeId: defaultCafeId }),
      ]);

      expect(res1.body.status).toBe('flow_reply');
      expect(res2.body.status).toBe('flow_reply');

      const order1 = await prisma.order.findFirst({
        where: { customer: { phone: phone1 } },
      });
      const order2 = await prisma.order.findFirst({
        where: { customer: { phone: phone2 } },
      });

      expect(order1).toBeDefined();
      expect(order2).toBeDefined();
      expect(order1.code).not.toBe(order2.code);
      expect(order1.source).toBe('WHATSAPP');
      expect(order2.source).toBe('WHATSAPP');
    });

    it('should link unknown phone numbers to newly created customer records', async () => {
      const unknownPhone = `+2010${Math.floor(10000000 + Math.random() * 90000000)}`;

      await request(app.getHttpServer())
        .post('/communication/webhook/whatsapp')
        .send({
          phone: unknownPhone,
          message: 'عايز 1 لاتيه',
          messageId: `msg-new-cust-${Date.now()}`,
          cafeId: defaultCafeId,
        })
        .expect(201);

      const customer = await prisma.customer.findUnique({
        where: {
          cafeId_branchId_phone: {
            cafeId: defaultCafeId,
            branchId: defaultBranchId,
            phone: unknownPhone,
          },
        },
      });
      expect(customer).toBeDefined();
      expect(customer.name).toBe('AI Customer');

      const order = await prisma.order.findFirst({ where: { customerId: customer.id } });
      expect(order).toBeDefined();
      expect(order.source).toBe('WHATSAPP');
    });
  });

  // ─────────────────────────────────────────────
  // Phase 7: Existing Order Flow Compatibility
  // ─────────────────────────────────────────────

  describe('Regression Testing: In-Café and Delivery POS Flows', () => {
    it('should continue to allow IN_CAFE orders and broadcast them with correct source badge', async () => {
      const phone = makePhone();
      
      const res = await authedPost('/orders')
        .send({
          customerPhone: phone,
          type: 'DINE_IN',
          items: [{ productId: testLatteProduct.id, quantity: 1 }],
          source: 'IN_CAFE',
        })
        .expect(201);

      const orderId = res.body.id;
      expect(res.body.source).toBe('IN_CAFE');

      // Wait for WS
      await new Promise(r => setTimeout(r, 100));

      const baristaReceived = baristaEvents.find(e => e.eventType === 'order.created' && (e.payload as any).orderId === orderId);
      expect(baristaReceived).toBeDefined();
      expect((baristaReceived.payload as any).source).toBe('IN_CAFE');
    });

    it('should continue to allow DELIVERY orders and broadcast them with correct source badge', async () => {
      const phone = makePhone();
      
      const res = await authedPost('/orders')
        .send({
          customerPhone: phone,
          type: 'DELIVERY',
          items: [{ productId: testMintTeaProduct.id, quantity: 2 }],
          source: 'DELIVERY',
        })
        .expect(201);

      const orderId = res.body.id;
      expect(res.body.source).toBe('DELIVERY');

      // Wait for WS
      await new Promise(r => setTimeout(r, 100));

      const baristaReceived = baristaEvents.find(e => e.eventType === 'order.created' && (e.payload as any).orderId === orderId);
      expect(baristaReceived).toBeDefined();
      expect((baristaReceived.payload as any).source).toBe('DELIVERY');
    });
  });
});
