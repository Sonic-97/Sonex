import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MerchantPortalController } from './merchant-portal.controller';
import { MerchantPortalService } from './merchant-portal.service';
import { MerchantPortalAuthGuard } from './merchant-portal-auth.guard';
import { MerchantCommunicationService } from '../merchant-communication/merchant-communication.service';
import { MerchantAvailabilityService } from '../merchant-availability/merchant-availability.service';
import { TrustReputationService } from '../trust-reputation/trust-reputation.service';

describe('MerchantPortalController', () => {
  let app: INestApplication;
  let mcp: Record<string, jest.Mock>;
  let availability: Record<string, jest.Mock>;
  let trust: Record<string, jest.Mock>;
  let validToken: string;

  beforeAll(async () => {
    mcp = {
      getOrderHistory: jest.fn().mockResolvedValue([{ messageId: 'm1', messageType: 'NEW_ORDER' }]),
      receiveResponse: jest.fn().mockResolvedValue({ success: true, status: 'ACCEPTED' }),
      receiveMessage: jest.fn().mockResolvedValue({ success: true, status: 'PROCESSED' }),
    };
    availability = {
      getAvailability: jest.fn().mockResolvedValue({ cafeId: 'cafe-1', status: 'OPEN', queueLength: 0, currentETA: 5 }),
      pause: jest.fn().mockResolvedValue({ cafeId: 'cafe-1', status: 'PAUSED' }),
      resume: jest.fn().mockResolvedValue({ cafeId: 'cafe-1', status: 'OPEN' }),
    };
    trust = {
      getReputation: jest.fn().mockResolvedValue({ trustScore: 85 }),
      getMerchantBadges: jest.fn().mockResolvedValue(['Top Rated']),
      getQualityAlerts: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MerchantPortalController],
      providers: [
        MerchantPortalService,
        MerchantPortalAuthGuard,
        { provide: MerchantCommunicationService, useValue: mcp },
        { provide: MerchantAvailabilityService, useValue: availability },
        { provide: TrustReputationService, useValue: trust },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    MerchantPortalAuthGuard.clearTokens();
    validToken = '';
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginAs(merchantId: string, apiKey: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/merchant/auth/login')
      .send({ merchantId, apiKey });
    return res.body.token;
  }

  it('authenticates merchant and returns token', async () => {
    const res = await request(app.getHttpServer())
      .post('/merchant/auth/login')
      .send({ merchantId: 'merchant-1', apiKey: 'cafe-1' })
      .expect(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.merchantId).toBe('merchant-1');
  });

  it('authorizes and returns order details', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    const res = await request(app.getHttpServer())
      .get('/merchant/orders/ord-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.messages).toBeDefined();
    expect(mcp.getOrderHistory).toHaveBeenCalledWith('ord-1', 'merchant-1');
  });

  it('accepts order via MCP delegation', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    const res = await request(app.getHttpServer())
      .post('/merchant/orders/ord-1/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchantOrderId: 'ord-1', customerOrderId: 'co-1' })
      .expect(201);
    expect(mcp.receiveResponse).toHaveBeenCalledWith('merchant-1', 'ord-1', 'co-1', 'ACCEPT', 'cafe-1');
  });

  it('rejects order via MCP delegation', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    const res = await request(app.getHttpServer())
      .post('/merchant/orders/ord-1/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchantOrderId: 'ord-1', customerOrderId: 'co-1', reason: 'Out of stock' })
      .expect(201);
    expect(mcp.receiveResponse).toHaveBeenCalledWith('merchant-1', 'ord-1', 'co-1', 'REJECT', 'cafe-1', { reason: 'Out of stock' });
  });

  it('marks order as preparing via MCP', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    const res = await request(app.getHttpServer())
      .post('/merchant/orders/ord-1/preparing')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchantOrderId: 'ord-1', customerOrderId: 'co-1' })
      .expect(201);
    expect(mcp.receiveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'PREPARATION_STARTED' }), 'cafe-1');
  });

  it('marks order as ready for pickup via MCP', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    const res = await request(app.getHttpServer())
      .post('/merchant/orders/ord-1/ready')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchantOrderId: 'ord-1', customerOrderId: 'co-1' })
      .expect(201);
    expect(mcp.receiveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'READY_FOR_PICKUP' }), 'cafe-1');
  });

  it('sends delay notice via MCP', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    const res = await request(app.getHttpServer())
      .post('/merchant/orders/ord-1/delay')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchantOrderId: 'ord-1', customerOrderId: 'co-1', extraMinutes: 10 })
      .expect(201);
    expect(mcp.receiveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'DELAY_NOTICE', payload: { extraMinutes: 10 } }), 'cafe-1');
  });

  it('reports out of stock via MCP', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    const res = await request(app.getHttpServer())
      .post('/merchant/orders/ord-1/out-of-stock')
      .set('Authorization', `Bearer ${token}`)
      .send({ merchantOrderId: 'ord-1', customerOrderId: 'co-1', productName: 'Cappuccino' })
      .expect(201);
    expect(mcp.receiveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'OUT_OF_STOCK', payload: { productName: 'Cappuccino' } }), 'cafe-1');
  });

  it('gets and updates availability', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    const getRes = await request(app.getHttpServer())
      .get('/merchant/availability')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(getRes.body.status).toBe('OPEN');

    const putRes = await request(app.getHttpServer())
      .put('/merchant/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'pause' })
      .expect(200);
    expect(availability.pause).toHaveBeenCalledWith('cafe-1');
  });

  it('rejects unauthorized merchant', async () => {
    await request(app.getHttpServer())
      .post('/merchant/orders/ord-1/accept')
      .set('Authorization', 'Bearer invalid-token')
      .send({ merchantOrderId: 'ord-1', customerOrderId: 'co-1' })
      .expect(401);
  });

  it('forbids access to other merchant orders', async () => {
    const token = await loginAs('merchant-1', 'cafe-1');
    mcp.getOrderHistory.mockResolvedValueOnce([]);
    await request(app.getHttpServer())
      .get('/merchant/orders/other-ord')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
