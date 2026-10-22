import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CustomerApiController } from './customer-api.controller';
import { CustomerApiService } from './customer-api.service';
import { CustomerApiAuthGuard } from './customer-api-auth.guard';
import { CustomerApiSessionService } from './customer-api-session.service';
import { CustomerOtpService } from './customer-otp.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

let sessionService: CustomerApiSessionService;
let otpService: CustomerOtpService;
import { PrismaService } from '../prisma/prisma.service';
import { ContextBuilderService } from '../commerce-brain/context-builder.service';
import { CommerceBrainService } from '../commerce-brain/commerce-brain.service';
import { ActionPlannerService } from '../action-planner/action-planner.service';
import { ActionExecutorService } from '../action-executor/action-executor.service';

describe('CustomerApiController', () => {
  let app: INestApplication;
  let prisma: any;
  let contextBuilder: Record<string, jest.Mock>;
  let commerceBrain: Record<string, jest.Mock>;
  let planner: Record<string, jest.Mock>;
  let executor: Record<string, jest.Mock>;

  const mockCustomer = { id: 'cust-1', cafeId: 'cafe-1', phone: '01000000000', name: 'Ahmed' };
  const mockContext = {
    business: { id: 'cafe-1', name: 'Cafe Central', workingNow: true },
    customer: { customerId: 'cust-1', firstName: 'Ahmed' },
    conversation: { currentStep: 'ordering', collectedInformation: {}, missingInformation: [] },
    catalog: { products: [], totalCount: 0 },
  };
  const mockDecision = {
    intent: 'ORDER', confidence: 0.95, requiredConfirmation: true,
    missingInformation: [], recommendations: [],
    nextAction: 'CONFIRM_ORDER', structuredReplyData: { bodyKey: 'order.confirm' },
    extractedEntities: {}, reasoningCode: 'CONTINUE_CONVERSATION',
  };
  const mockPlan = {
    planId: 'plan-1', intent: 'ORDER', steps: [{ action: 'CreateOrder' }],
    requiredConfirmation: true, blockingReasons: [],
    estimatedExecution: '15min', priority: 'high',
  };
  const mockExecResult = { status: 'COMPLETED', stepOutputs: { orderId: 'co-1' } };

  beforeAll(async () => {
    prisma = {
      customer: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.phone === '01000000000' && where.cafeId === 'cafe-1') return Promise.resolve(mockCustomer);
          return Promise.resolve(null);
        }),
      },
      customerOrder: {
        findMany: jest.fn().mockImplementation((args) => {
          if (args?.select?.merchantOrders?.select?.items) {
            return Promise.resolve([
              {
                merchantOrders: [
                  { items: [{ productName: 'Cappuccino' }, { productName: 'Latte' }] },
                ],
              },
            ]);
          }
          return Promise.resolve([
            {
              id: 'co-1', status: 'COMPLETED', subtotal: 100, deliveryFee: 10, grandTotal: 110,
              createdAt: new Date('2026-07-17T10:00:00Z'), customerId: 'cust-1',
              merchantOrders: [{ id: 'mo-1', cafeId: 'cafe-1', businessName: 'Cafe Central', status: 'COMPLETED' }],
            },
          ]);
        }),
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          if (id === 'co-1') return Promise.resolve({
            id: 'co-1', status: 'COMPLETED', subtotal: 100, deliveryFee: 10, grandTotal: 110,
            createdAt: new Date('2026-07-17T10:00:00Z'), customerId: 'cust-1',
            merchantOrders: [
              {
                id: 'mo-1', cafeId: 'cafe-1', businessName: 'Cafe Central', status: 'COMPLETED',
                items: [{ productName: 'Cappuccino', quantity: 2, unitPrice: 30, totalPrice: 60 }],
              },
            ],
          });
          return Promise.resolve(null);
        }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'prod-1', name: 'Cappuccino', category: 'Coffee' },
          { id: 'prod-2', name: 'Latte', category: 'Coffee' },
        ]),
      },
    };

    contextBuilder = { build: jest.fn().mockResolvedValue(mockContext) };
    commerceBrain = { decide: jest.fn().mockResolvedValue(mockDecision) };
    planner = { createPlan: jest.fn().mockReturnValue(mockPlan) };
    executor = { execute: jest.fn().mockResolvedValue(mockExecResult) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerApiController],
      providers: [
        CustomerApiService,
        CustomerApiAuthGuard,
        CustomerApiSessionService,
        CustomerOtpService,
        { provide: WhatsappService, useValue: { sendMessage: jest.fn().mockResolvedValue({ success: true, provider: 'test' }) } },
        { provide: PrismaService, useValue: prisma },
        { provide: ContextBuilderService, useValue: contextBuilder },
        { provide: CommerceBrainService, useValue: commerceBrain },
        { provide: ActionPlannerService, useValue: planner },
        { provide: ActionExecutorService, useValue: executor },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    sessionService = app.get(CustomerApiSessionService);
    otpService = app.get(CustomerOtpService);
  });

  beforeEach(() => {
    CustomerApiAuthGuard.clearTokens();
    sessionService.clearAll();
    otpService.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginAs(phone: string, cafeId: string): Promise<string> {
    otpService.reset();
    const otpRes = await request(app.getHttpServer())
      .post('/customer/auth/request-otp')
      .send({ phone, cafeId })
      .expect(200);
    const res = await request(app.getHttpServer())
      .post('/customer/auth/login')
      .send({ phone, cafeId, otp: otpRes.body.devCode })
      .expect(200);
    return res.body.token;
  }

  // ── Authentication ──

  it('requests an OTP then authenticates customer with a valid code', async () => {
    const otpRes = await request(app.getHttpServer())
      .post('/customer/auth/request-otp')
      .send({ phone: '01000000000', cafeId: 'cafe-1' })
      .expect(200);
    expect(otpRes.body.devCode).toBeDefined();

    const res = await request(app.getHttpServer())
      .post('/customer/auth/login')
      .send({ phone: '01000000000', cafeId: 'cafe-1', otp: otpRes.body.devCode })
      .expect(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.customerId).toBe('cust-1');
  });

  it('rejects login without an OTP', async () => {
    await request(app.getHttpServer())
      .post('/customer/auth/login')
      .send({ phone: '01000000000', cafeId: 'cafe-1' })
      .expect(401);
  });

  it('rejects an incorrect OTP', async () => {
    await request(app.getHttpServer())
      .post('/customer/auth/request-otp')
      .send({ phone: '01000000000', cafeId: 'cafe-1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/customer/auth/login')
      .send({ phone: '01000000000', cafeId: 'cafe-1', otp: '000000' })
      .expect(401);
  });

  it('rejects invalid customer credentials', async () => {
    await request(app.getHttpServer())
      .post('/customer/auth/login')
      .send({ phone: 'wrong', cafeId: 'cafe-1', otp: '000000' })
      .expect(404);
  });

  // ── Authorization ──

  it('rejects missing auth token', async () => {
    await request(app.getHttpServer())
      .get('/customer/orders')
      .expect(401);
  });

  // ── Simple Message ──

  it('processes a simple message through pipeline', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    const noConfirmPlan = { ...mockPlan, requiredConfirmation: false };
    planner.createPlan.mockReturnValueOnce(noConfirmPlan);

    const res = await request(app.getHttpServer())
      .post('/customer/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'أريد كابتشينو' })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.type).toBe('execution');
    expect(contextBuilder.build).toHaveBeenCalled();
    expect(commerceBrain.decide).toHaveBeenCalled();
    expect(executor.execute).toHaveBeenCalled();
  });

  it('rejects empty message', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    await request(app.getHttpServer())
      .post('/customer/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: '' })
      .expect(400);
  });

  // ── Clarification Flow ──

  it('returns clarification when hard blockers exist', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    const blockedPlan = {
      ...mockPlan,
      requiredConfirmation: false,
      blockingReasons: [{ type: 'BusinessClosed', reason: 'Business is closed', severity: 'hard' }],
    };
    planner.createPlan.mockReturnValueOnce(blockedPlan);

    const res = await request(app.getHttpServer())
      .post('/customer/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'أريد طلب' })
      .expect(201);
    expect(res.body.type).toBe('clarification');
    expect(res.body.data.blockingReasons).toBeDefined();
  });

  // ── Confirmation Flow ──

  it('returns confirmation request when required', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    const res = await request(app.getHttpServer())
      .post('/customer/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'أريد كابتشينو' })
      .expect(201);
    expect(res.body.type).toBe('confirmation');
    expect(res.body.requiresConfirmation).toBe(true);
  });

  it('executes order after confirmation', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    // First message creates session
    await request(app.getHttpServer())
      .post('/customer/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'أريد كابتشينو' })
      .expect(201);

    const noConfirmPlan = { ...mockPlan, requiredConfirmation: false };
    planner.createPlan.mockReturnValueOnce(noConfirmPlan);

    const res = await request(app.getHttpServer())
      .post('/customer/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: true })
      .expect(201);
    expect(res.body.type).toBe('execution');
    expect(executor.execute).toHaveBeenCalled();
  });

  it('cancels conversation on negative confirmation', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    await request(app.getHttpServer())
      .post('/customer/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'أريد كابتشينو' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/customer/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: false })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('إلغاء');
  });

  // ── Cancel Order ──

  it('cancels order through pipeline', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    const cancelDecision = { ...mockDecision, intent: 'CANCEL_ORDER', requiredConfirmation: false };
    commerceBrain.decide.mockResolvedValueOnce(cancelDecision);
    const cancelPlan = { ...mockPlan, intent: 'CANCEL_ORDER', requiredConfirmation: false };
    planner.createPlan.mockReturnValueOnce(cancelPlan);

    const res = await request(app.getHttpServer())
      .post('/customer/cancel')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(res.body.success).toBe(true);
  });

  // ── Order History ──

  it('returns order history', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    const res = await request(app.getHttpServer())
      .get('/customer/history')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  // ── Order Status ──

  it('returns single order detail', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    const res = await request(app.getHttpServer())
      .get('/customer/orders/co-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.orderId).toBe('co-1');
    expect(res.body.items).toBeDefined();
  });

  it('returns 404 for non-existent order', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    await request(app.getHttpServer())
      .get('/customer/orders/non-existent')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ── Recommendations ──

  it('returns product recommendations', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    const res = await request(app.getHttpServer())
      .get('/customer/recommendations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].productId).toBeDefined();
  });

  // ── Expired Conversation ──

  it('returns expired conversation error on confirm without session', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    // Don't send message first — no session
    await request(app.getHttpServer())
      .post('/customer/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ confirmed: true })
      .expect(400);
  });

  // ── Backend Failure ──

  it('handles pipeline failure gracefully', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    contextBuilder.build.mockRejectedValueOnce(new Error('Database connection failed'));

    const res = await request(app.getHttpServer())
      .post('/customer/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'test' })
      .expect(201);
    expect(res.body.success).toBe(false);
    expect(res.body.type).toBe('error');
  });

  // ── Order List ──

  it('lists customer orders', async () => {
    const token = await loginAs('01000000000', 'cafe-1');
    const res = await request(app.getHttpServer())
      .get('/customer/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
