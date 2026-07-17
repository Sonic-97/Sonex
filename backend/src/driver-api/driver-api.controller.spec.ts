import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DriverApiController } from './driver-api.controller';
import { DriverApiService } from './driver-api.service';
import { DriverApiAuthGuard } from './driver-api-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DriverDispatchService } from '../driver-dispatch/driver-dispatch.service';
import { DriverPresenceService } from '../driver-presence/driver-presence.service';
import { OrderOrchestratorService } from '../order-orchestrator/order-orchestrator.service';

describe('DriverApiController', () => {
  let app: INestApplication;
  let prisma: any;
  let dispatch: Record<string, jest.Mock>;
  let presence: Record<string, jest.Mock>;
  let orchestrator: Record<string, jest.Mock>;

  const mockDriver = {
    id: 'driver-1',
    name: 'Ahmed',
    phone: '01000000000',
    driverStatus: 'ONLINE',
    vehicleType: 'motorcycle',
    capacity: 3,
    activeAssignments: 1,
    totalDeliveries: 42,
  };

  const futureDate = new Date(Date.now() + 86400000);
  const pastDate = new Date(Date.now() - 86400000);

  const mockAssignment = {
    id: 'assign-1',
    driverId: 'driver-1',
    merchantOrderId: 'mo-1',
    status: 'PENDING',
    score: 0.85,
    assignedAt: new Date(Date.now() - 3600000),
    expiresAt: futureDate,
    respondedAt: null,
    merchantOrder: {
      customerOrderId: 'co-1',
      businessName: 'Cafe Central',
      status: 'READY',
      pickupSequence: 0,
      estimatedReadyAt: new Date(Date.now() + 1800000),
    },
  };

  const mockAcceptedAssignment = {
    ...mockAssignment,
    status: 'ACCEPTED',
    respondedAt: new Date(Date.now() - 3000000),
  };

  beforeAll(async () => {
    prisma = {
      driver: {
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          if (id === 'driver-1') return Promise.resolve(mockDriver);
          if (id === 'driver-2') return Promise.resolve({ ...mockDriver, id: 'driver-2', phone: '01000000001' });
          return Promise.resolve(null);
        }),
      },
      driverAssignment: {
        findMany: jest.fn().mockResolvedValue([mockAssignment, { ...mockAssignment, id: 'assign-2', status: 'ACCEPTED' }]),
        findUnique: jest.fn().mockImplementation(({ where: { id } }) => {
          if (id === 'assign-1') return Promise.resolve(mockAssignment);
          if (id === 'assign-1-accepted') return Promise.resolve(mockAcceptedAssignment);
          if (id === 'assign-expired') return Promise.resolve({
            ...mockAssignment,
            id: 'assign-expired',
            expiresAt: pastDate,
          });
          if (id === 'assign-other') return Promise.resolve({
            ...mockAssignment,
            id: 'assign-other',
            driverId: 'driver-other',
          });
          return Promise.resolve(null);
        }),
      },
    };

    dispatch = {
      acceptAssignment: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
      rejectAssignment: jest.fn().mockResolvedValue({ status: 'REJECTED' }),
      completeDriverAssignment: jest.fn().mockResolvedValue(undefined),
      updateDriverHeartbeat: jest.fn().mockResolvedValue(undefined),
      updateDriverStatus: jest.fn().mockResolvedValue(undefined),
      findEligibleDrivers: jest.fn().mockResolvedValue([]),
      scoreDrivers: jest.fn().mockReturnValue([]),
      dispatchDriver: jest.fn().mockResolvedValue(null),
    };

    presence = {
      goOnline: jest.fn().mockResolvedValue(undefined),
      goOffline: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      updateLocation: jest.fn().mockResolvedValue(undefined),
      heartbeat: jest.fn().mockResolvedValue(undefined),
      checkExpiredHeartbeats: jest.fn().mockResolvedValue([]),
    };

    orchestrator = {
      pickupMerchantOrder: jest.fn().mockResolvedValue({ status: 'PICKED_UP' }),
      completeMerchantOrder: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      deliverCustomerOrder: jest.fn().mockResolvedValue({ status: 'DELIVERED' }),
      assignDriver: jest.fn().mockResolvedValue(undefined),
      getDriverRoute: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverApiController],
      providers: [
        DriverApiService,
        DriverApiAuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: DriverDispatchService, useValue: dispatch },
        { provide: DriverPresenceService, useValue: presence },
        { provide: OrderOrchestratorService, useValue: orchestrator },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    DriverApiAuthGuard.clearTokens();
  });

  afterAll(async () => {
    await app.close();
  });

  async function loginAs(driverId: string, apiKey: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/driver/auth/login')
      .send({ driverId, apiKey });
    return res.body.token;
  }

  // ── Authentication ──

  it('authenticates driver with valid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/driver/auth/login')
      .send({ driverId: 'driver-1', apiKey: '01000000000' })
      .expect(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.driverId).toBe('driver-1');
  });

  it('rejects invalid driver credentials', async () => {
    await request(app.getHttpServer())
      .post('/driver/auth/login')
      .send({ driverId: 'driver-1', apiKey: 'wrong-key' })
      .expect(404);
  });

  // ── Authorization ──

  it('rejects missing auth token', async () => {
    await request(app.getHttpServer())
      .get('/driver/profile')
      .expect(401);
  });

  // ── Profile ──

  it('returns driver profile', async () => {
    const token = await loginAs('driver-1', '01000000000');
    const res = await request(app.getHttpServer())
      .get('/driver/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.driverId).toBe('driver-1');
    expect(res.body.name).toBe('Ahmed');
  });

  // ── Assignment List ──

  it('lists assignments for authenticated driver', async () => {
    const token = await loginAs('driver-1', '01000000000');
    const res = await request(app.getHttpServer())
      .get('/driver/assignments')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].assignmentId).toBeDefined();
  });

  // ── Single Assignment ──

  it('returns single assignment detail', async () => {
    const token = await loginAs('driver-1', '01000000000');
    const res = await request(app.getHttpServer())
      .get('/driver/assignments/assign-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.assignmentId).toBe('assign-1');
  });

  // ── Accept Assignment ──

  it('accepts a pending assignment', async () => {
    const token = await loginAs('driver-1', '01000000000');
    // Re-fetch to ensure status is PENDING
    prisma.driverAssignment.findUnique.mockResolvedValueOnce(mockAssignment);
    const res = await request(app.getHttpServer())
      .post('/driver/assignments/assign-1/accept')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(dispatch.acceptAssignment).toHaveBeenCalledWith('assign-1');
    expect(res.body.success).toBe(true);
  });

  // ── Reject Assignment ──

  it('rejects a pending assignment', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driverAssignment.findUnique.mockResolvedValueOnce(mockAssignment);
    const res = await request(app.getHttpServer())
      .post('/driver/assignments/assign-1/reject')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(dispatch.rejectAssignment).toHaveBeenCalledWith('assign-1');
    expect(res.body.success).toBe(true);
  });

  // ── Duplicate Accept ──

  it('rejects duplicate accept on already accepted assignment', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driverAssignment.findUnique.mockResolvedValueOnce(mockAcceptedAssignment);
    await request(app.getHttpServer())
      .post('/driver/assignments/assign-1-accepted/accept')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });

  // ── Expired Assignment ──

  it('rejects accept on expired assignment', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driverAssignment.findUnique.mockResolvedValueOnce({
      ...mockAssignment,
      id: 'assign-expired',
      expiresAt: pastDate,
    });
    await request(app.getHttpServer())
      .post('/driver/assignments/assign-expired/accept')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  // ── Unauthorized Assignment ──

  it('returns not found for other driver assignment', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driverAssignment.findUnique.mockResolvedValueOnce({
      ...mockAssignment,
      id: 'assign-other',
      driverId: 'driver-other',
    });
    await request(app.getHttpServer())
      .get('/driver/assignments/assign-other')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  // ── Pickup ──

  it('completes pickup for accepted assignment', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driverAssignment.findUnique.mockResolvedValueOnce(mockAcceptedAssignment);
    const res = await request(app.getHttpServer())
      .post('/driver/assignments/assign-1-accepted/picked-up')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(orchestrator.pickupMerchantOrder).toHaveBeenCalledWith('mo-1');
    expect(res.body.success).toBe(true);
  });

  // ── Delivery ──

  it('completes delivery for accepted assignment', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driverAssignment.findUnique.mockResolvedValueOnce(mockAcceptedAssignment);
    const res = await request(app.getHttpServer())
      .post('/driver/assignments/assign-1-accepted/delivered')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(orchestrator.completeMerchantOrder).toHaveBeenCalledWith('mo-1');
    expect(orchestrator.deliverCustomerOrder).toHaveBeenCalledWith('co-1');
    expect(res.body.success).toBe(true);
  });

  // ── Location Update ──

  it('updates driver location', async () => {
    const token = await loginAs('driver-1', '01000000000');
    const res = await request(app.getHttpServer())
      .put('/driver/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 30.0444, longitude: 31.2357 })
      .expect(200);
    expect(presence.updateLocation).toHaveBeenCalledWith('driver-1', 30.0444, 31.2357);
    expect(res.body.success).toBe(true);
  });

  it('rejects invalid latitude', async () => {
    const token = await loginAs('driver-1', '01000000000');
    await request(app.getHttpServer())
      .put('/driver/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 100, longitude: 31.2357 })
      .expect(400);
  });

  // ── Status / Pause / Resume ──

  it('pauses driver', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driver.findUnique.mockResolvedValueOnce({ ...mockDriver, driverStatus: 'ONLINE' });
    const res = await request(app.getHttpServer())
      .put('/driver/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'PAUSED' })
      .expect(200);
    expect(presence.pause).toHaveBeenCalledWith('driver-1');
    expect(res.body.success).toBe(true);
  });

  it('resumes driver from paused', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driver.findUnique.mockResolvedValueOnce({ ...mockDriver, driverStatus: 'PAUSED' });
    const res = await request(app.getHttpServer())
      .put('/driver/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ONLINE' })
      .expect(200);
    expect(presence.resume).toHaveBeenCalledWith('driver-1');
    expect(res.body.success).toBe(true);
  });

  it('takes driver offline', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driver.findUnique.mockResolvedValueOnce(mockDriver);
    const res = await request(app.getHttpServer())
      .put('/driver/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'OFFLINE' })
      .expect(200);
    expect(presence.goOffline).toHaveBeenCalledWith('driver-1');
    expect(res.body.success).toBe(true);
  });

  it('rejects invalid status', async () => {
    const token = await loginAs('driver-1', '01000000000');
    prisma.driver.findUnique.mockResolvedValueOnce(mockDriver);
    await request(app.getHttpServer())
      .put('/driver/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'BUSY' })
      .expect(400);
  });
});
