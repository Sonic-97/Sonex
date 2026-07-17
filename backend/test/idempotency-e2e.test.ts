import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { IdempotencyService } from '../src/common/idempotency.service';

describe('Order Idempotency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let idempotencyService: IdempotencyService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    idempotencyService = app.get(IdempotencyService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /orders with Idempotency-Key', () => {
    const idempotencyKey = `e2e-orders-${Date.now()}`;

    it('should create order on first request (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({
          customerPhone: `+2010${String(Date.now()).slice(-8)}`,
          customerName: 'Idempotency Test',
          type: 'TAKEAWAY',
          sourceType: 'INSIDE_CAFE',
          items: [{ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
          idempotencyKey,
        })
        .expect(201);

      expect(res.body).toBeDefined();
      expect(res.body.id).toBeDefined();
    });

    it('should return same order on duplicate request (200)', async () => {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .send({
          customerPhone: `+2010${String(Date.now()).slice(-8)}`,
          customerName: 'Idempotency Test Duplicate',
          type: 'TAKEAWAY',
          sourceType: 'INSIDE_CAFE',
          items: [{ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
          idempotencyKey,
        })
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body.replayed).toBe(true);
    });
  });

  describe('POST /in-cafe/orders with Idempotency-Key', () => {
    const idempotencyKey = `e2e-incafe-${Date.now()}`;

    it('should create order on first request', async () => {
      const res = await request(app.getHttpServer())
        .post('/in-cafe/orders')
        .send({
          createdById: '00000000-0000-0000-0000-000000000002',
          items: [{ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
          idempotencyKey,
        });

      expect(res.body).toBeDefined();
      expect(res.body.id || res.body.data?.id).toBeDefined();
    });

    it('should return same order on duplicate request', async () => {
      const res = await request(app.getHttpServer())
        .post('/in-cafe/orders')
        .send({
          createdById: '00000000-0000-0000-0000-000000000002',
          items: [{ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
          idempotencyKey,
        });

      expect(res.body).toBeDefined();
      expect(res.body.replayed).toBe(true);
    });
  });

  describe('IdempotencyService integration', () => {
    it('should detect duplicate by (source, key)', async () => {
      const key = `test-key-${Date.now()}`;
      const cafeId = 'test-cafe-id';
      const source = 'http_api';

      const before = await idempotencyService.isProcessed(source, key, cafeId);
      expect(before.duplicated).toBe(false);
    });

    it('should record and detect processed message', async () => {
      const key = `record-test-${Date.now()}`;
      const cafeId = 'test-cafe-id';
      const source = 'http_api';

      await prisma.$transaction(async (tx) => {
        await idempotencyService.record(source, key, 'Order', 'test-order-id', 'completed', cafeId, tx);
      });

      const after = await idempotencyService.isProcessed(source, key, cafeId);
      expect(after.duplicated).toBe(true);
      expect(after.entityId).toBe('test-order-id');
    });
  });
});
