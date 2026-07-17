import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OpenwaSessionService, OpenwaSessionState } from '../src/reliability/openwa-session.service';
import { SessionRecoveryOrchestrator } from '../src/reliability/session-recovery-orchestrator.service';
import { OpenwaMetricsService } from '../src/reliability/openwa-metrics.service';
import { OpenwaAlertService } from '../src/reliability/openwa-alert.service';
import { HealthCheckService } from '../src/reliability/health-check.service';
import { WebhookRecoveryService } from '../src/reliability/webhook-recovery.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { EventsService } from '../src/events/events.service';

jest.mock('axios');
const mockAxios = jest.requireMock('axios') as jest.Mocked<{ get: any; post: any; delete: any; isAxiosError: any; create: any }>;
const mockEventEmitter = { emit: jest.fn() };

function mockPrismaService(): Partial<PrismaService> {
  return {
    cafe: {
      findMany: jest.fn().mockResolvedValue([{ id: 'cafe-1' }]),
    },
  } as any;
}

function mockHealthCheckService(): Partial<HealthCheckService> {
  return {
    checkAll: jest.fn().mockResolvedValue({
      openwa: { ok: true, latencyMs: 10 },
      redis: { ok: true },
      database: { ok: true },
      lastCheckedAt: new Date().toISOString(),
    }),
    isHealthy: jest.fn().mockReturnValue(true),
    getLastStatus: jest.fn().mockReturnValue(null),
  };
}

function mockWebhookRecoveryService(): Partial<WebhookRecoveryService> {
  return {
    ensureWebhookRegistered: jest.fn().mockResolvedValue(true),
  };
}

function mockEventsService(): Partial<EventsService> {
  return {
    emitToOwner: jest.fn(),
  };
}

describe('OpenwaSessionService', () => {
  let service: OpenwaSessionService;
  const OLD_ENV = process.env;

  beforeAll(() => {
    process.env.OPENWA_SESSION_ID = '15a2c1c5-1105-4286-b228-b7019ad447ea';
    process.env.OPENWA_API_URL = 'http://localhost:2785/api';
    process.env.OPENWA_API_KEY = 'dev-admin-key';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    mockAxios.get = jest.fn().mockReturnValue(undefined) as any;
    mockAxios.post = jest.fn().mockReturnValue(undefined) as any;
    mockAxios.delete = jest.fn().mockReturnValue(undefined) as any;
    mockAxios.isAxiosError = jest.fn().mockReturnValue(false) as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenwaSessionService,
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    service = module.get<OpenwaSessionService>(OpenwaSessionService);
  });

  it('should start in UNKNOWN state', () => {
    expect(service.getCurrentState()).toBe(OpenwaSessionState.UNKNOWN);
    expect(service.isConnected()).toBe(false);
  });

  it('should have session ID from env', () => {
    expect(service.getSessionId()).toBe('15a2c1c5-1105-4286-b228-b7019ad447ea');
  });

  describe('getStatus', () => {
    it('should transition to CONNECTED when session is active', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { status: 'connected' },
      });
      const result = await service.getStatus();
      expect(service.isConnected()).toBe(true);
      expect(result.state).toBe(OpenwaSessionState.CONNECTED);
    });

    it('should transition to CONNECTED for open status', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { state: 'open' },
      });
      const result = await service.getStatus();
      expect(service.isConnected()).toBe(true);
    });

    it('should transition to UNHEALTHY for disconnected session', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { status: 'disconnected' },
      });
      await service.getStatus();
      expect(service.isConnected()).toBe(false);
      expect(service.getCurrentState()).toBe(OpenwaSessionState.UNHEALTHY);
    });

    it('should auto-create session on 404 and transition to CONNECTING', async () => {
      mockAxios.isAxiosError.mockReturnValueOnce(true);
      mockAxios.get.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 404 },
        message: 'Not Found',
      });
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'a1b2c3d4-1234-5678-9abc-def012345678' },
        status: 200,
      });
      const result = await service.getStatus();
      expect(service.getSessionId()).toBe('a1b2c3d4-1234-5678-9abc-def012345678');
      expect(service.getCurrentState()).toBe(OpenwaSessionState.CONNECTING);
    });

    it('should set UNHEALTHY on network error', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Network error'));
      await service.getStatus();
      expect(service.getCurrentState()).toBe(OpenwaSessionState.UNHEALTHY);
    });
  });

  describe('reconnect', () => {
    it('should transition to REGISTERING on success', async () => {
      mockAxios.post.mockResolvedValueOnce({ status: 200 });
      const result = await service.reconnect();
      expect(result).toBe(true);
      expect(service.getCurrentState()).toBe(OpenwaSessionState.REGISTERING);
    });

    it('should transition to UNHEALTHY on failure', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('Timeout'));
      const result = await service.reconnect();
      expect(result).toBe(false);
      expect(service.getCurrentState()).toBe(OpenwaSessionState.UNHEALTHY);
    });
  });

  describe('createSession', () => {
    it('should create session and update sessionId', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'abcdef12-1234-5678-9012-abcdef123456' },
        status: 200,
      });
      const newId = await service.createSession();
      expect(newId).toBe('abcdef12-1234-5678-9012-abcdef123456');
      expect(service.getSessionId()).toBe('abcdef12-1234-5678-9012-abcdef123456');
      expect(service.getCurrentState()).toBe(OpenwaSessionState.CONNECTING);
    });

    it('should return null and set UNHEALTHY on API error', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('API unreachable'));
      const newId = await service.createSession();
      expect(newId).toBeNull();
      expect(service.getCurrentState()).toBe(OpenwaSessionState.UNHEALTHY);
    });
  });

  describe('deleteSession', () => {
    it('should clear sessionId and set UNKNOWN', async () => {
      mockAxios.delete.mockResolvedValueOnce({ status: 200 });
      const result = await service.deleteSession();
      expect(result).toBe(true);
      expect(service.getSessionId()).toBe('');
      expect(service.getCurrentState()).toBe(OpenwaSessionState.UNKNOWN);
    });
  });
});

describe('SessionRecoveryOrchestrator', () => {
  let orchestrator: SessionRecoveryOrchestrator;
  let healthCheck: jest.Mocked<Partial<HealthCheckService>>;
  let webhookRecovery: jest.Mocked<Partial<WebhookRecoveryService>>;
  const OLD_ENV = process.env;

  beforeAll(() => {
    process.env.WHATSAPP_PROVIDER = 'openwa';
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    mockAxios.get = jest.fn().mockReturnValue(undefined) as any;
    mockAxios.post = jest.fn().mockReturnValue(undefined) as any;
    mockAxios.delete = jest.fn().mockReturnValue(undefined) as any;
    mockAxios.isAxiosError = jest.fn().mockReturnValue(false) as any;
    healthCheck = mockHealthCheckService() as any;
    webhookRecovery = mockWebhookRecoveryService() as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionRecoveryOrchestrator,
        OpenwaSessionService,
        { provide: HealthCheckService, useValue: healthCheck },
        { provide: WebhookRecoveryService, useValue: webhookRecovery },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();
    orchestrator = module.get<SessionRecoveryOrchestrator>(SessionRecoveryOrchestrator);
  });

  it('should return ok when provider is not openwa', async () => {
    process.env.WHATSAPP_PROVIDER = 'mock';
    const status = await orchestrator.runRecoveryPipeline();
    expect(status.ok).toBe(true);
    expect(status.phase).toBe('complete');
    process.env.WHATSAPP_PROVIDER = 'openwa';
  });

  it('should complete all 4 phases when healthy and connected', async () => {
    mockAxios.get.mockResolvedValue({
      data: { status: 'connected' },
    });
    const status = await orchestrator.runRecoveryPipeline();
    expect(status.ok).toBe(true);
    expect(status.phase).toBe('complete');
  });

  it('should fail early when health check fails', async () => {
    healthCheck.checkAll!.mockResolvedValueOnce({
      openwa: { ok: false, latencyMs: 0, error: 'Unreachable' },
      redis: { ok: true },
      database: { ok: true },
      lastCheckedAt: new Date().toISOString(),
    });
    const status = await orchestrator.runRecoveryPipeline();
    expect(status.ok).toBe(false);
    expect(status.phase).toBe('health');
  });

  it('should fail at session phase when no session and create fails', async () => {
    mockAxios.isAxiosError.mockReturnValue(true);
    mockAxios.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
      message: 'Not Found',
    });
    mockAxios.post.mockRejectedValue(new Error('Creation failed'));
    const status = await orchestrator.runRecoveryPipeline();
    expect(status.ok).toBe(false);
    expect(status.phase).toBe('session');
  });

  it('should emit openwa.recovered on successful recovery', async () => {
    mockAxios.get.mockResolvedValue({
      data: { status: 'connected' },
    });
    await orchestrator.runRecoveryPipeline();
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'openwa.recovered',
      expect.objectContaining({ sessionId: expect.any(String) }),
    );
  });
});

describe('OpenwaMetricsService', () => {
  let service: OpenwaMetricsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenwaMetricsService],
    }).compile();
    service = module.get<OpenwaMetricsService>(OpenwaMetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return prometheus content type', () => {
    const contentType = service.getContentType();
    expect(contentType).toContain('text/plain');
  });

  it('should return metrics in prometheus format', async () => {
    const metrics = await service.getMetrics();
    expect(metrics).toBeDefined();
    expect(typeof metrics).toBe('string');
  });

  it('should have all expected metrics registered', async () => {
    const metrics = await service.getMetrics();
    expect(metrics).toContain('openwa_session_state');
    expect(metrics).toContain('openwa_recovery_attempts_total');
    expect(metrics).toContain('openwa_recovery_duration_seconds');
    expect(metrics).toContain('openwa_session_reconnects_total');
    expect(metrics).toContain('openwa_webhook_registrations_total');
    expect(metrics).toContain('openwa_consecutive_failures');
  });

  it('should update session state metrics on event', () => {
    const handler = (service as any).handleStateChanged.bind(service);
    handler({ to: OpenwaSessionState.CONNECTED });
    handler({ to: OpenwaSessionState.UNHEALTHY });
  });

  it('should update recovery metrics on event', () => {
    const handler = (service as any).handleRecoveryFailed.bind(service);
    handler({ phase: 'health', duration: 500, consecutiveFailures: 1 });
    handler({ phase: 'session', duration: 2000, consecutiveFailures: 2 });
  });

  it('should reset consecutive failures on recovered event', () => {
    const failHandler = (service as any).handleRecoveryFailed.bind(service);
    failHandler({ phase: 'health', duration: 500, consecutiveFailures: 3 });

    const recoveredHandler = (service as any).handleRecovered.bind(service);
    recoveredHandler({ duration: 5000 });

    const metricsPromise = service.getMetrics();
    expect(metricsPromise).resolves.toContain('openwa_consecutive_failures 0');
  });
});

describe('OpenwaAlertService', () => {
  let service: OpenwaAlertService;
  let prisma: Partial<PrismaService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = mockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenwaAlertService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: mockEventsService() },
      ],
    }).compile();
    service = module.get<OpenwaAlertService>(OpenwaAlertService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should emit critical alert on 3+ consecutive failures', async () => {
    const handler = (service as any).handleRecoveryFailed.bind(service);
    await handler({ phase: 'health', consecutiveFailures: 3 });
    expect((service as any).state.consecutiveFailures).toBe(3);
  });

  it('should reset state on recovery', async () => {
    const failHandler = (service as any).handleRecoveryFailed.bind(service);
    await failHandler({ phase: 'health', consecutiveFailures: 3 });

    const recoveredHandler = (service as any).handleRecovered.bind(service);
    await recoveredHandler({ sessionId: 'test', duration: 5000 });

    expect((service as any).state.consecutiveFailures).toBe(0);
  });

  it('should log webhook errors', async () => {
    const handler = (service as any).handleRecoveryFailed.bind(service);
    await handler({ phase: 'webhook', consecutiveFailures: 1 });
    expect((service as any).state.webhookFailedCount).toBe(1);
  });
});
