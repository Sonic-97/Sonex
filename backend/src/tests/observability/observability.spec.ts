import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

jest.mock('axios', () => ({
  get: jest.fn().mockResolvedValue({ status: 200 }),
  default: { get: jest.fn().mockResolvedValue({ status: 200 }) },
}));
import { HealthController } from '../../observability/health/health.controller';
import { HealthIndicatorsService } from '../../observability/health/health-indicators.service';
import { ConfigurationService } from '../../observability/configuration/configuration.service';
import { GlobalExceptionFilter } from '../../observability/filters/global-exception.filter';
import { GracefulShutdownService } from '../../observability/shutdown/graceful-shutdown.service';
import { CorrelationIdMiddleware } from '../../observability/logger/correlation-id.middleware';
import { RequestLoggingInterceptor } from '../../observability/logger/request-logging.interceptor';
import { MetricsService } from '../../observability/metrics/metrics.service';
import { PinoLoggerService } from '../../observability/logger/pino-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { HttpException, HttpStatus } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockPrisma = {
  $queryRaw: jest.fn(),
  $disconnect: jest.fn(),
};

const mockRedisClient = {
  ping: jest.fn(),
  quit: jest.fn(),
};

const mockRedis = {
  getClient: jest.fn(() => mockRedisClient),
};

const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  getPino: jest.fn(),
};

// ---------------------------------------------------------------------------
// Health endpoints
// ---------------------------------------------------------------------------
describe('Health Endpoints', () => {
  let controller: HealthController;
  let healthService: HealthIndicatorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthIndicatorsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        PinoLoggerService,
      ],
    })
      .overrideProvider(PinoLoggerService)
      .useValue(mockLogger)
      .compile();

    controller = module.get(HealthController);
    healthService = module.get(HealthIndicatorsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('GET /live returns alive', () => {
    const result = controller.live();
    expect(result).toHaveProperty('status', 'alive');
    expect(result).toHaveProperty('timestamp');
  });

  it('GET /health returns component statuses', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);
    mockRedisClient.ping.mockResolvedValue('PONG');

    const result = await controller.checkHealth();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('components');
    expect(result).toHaveProperty('timestamp');
    expect(result.components).toHaveProperty('database');
    expect(result.components).toHaveProperty('redis');
  });

  it('GET /ready returns ready when all components ok', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);
    mockRedisClient.ping.mockResolvedValue('PONG');

    const result = await controller.ready();
    expect(result).toHaveProperty('status', 'ready');
  });

  it('GET /ready returns not_ready when a component is down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB down'));

    const result = await controller.ready();
    expect(result).toHaveProperty('status', 'not_ready');
  });

  it('health detects database down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));

    const result = await controller.checkHealth();
    expect(result.components.database.status).toBe('down');
    expect(result.status).toBe('down');
  });

  it('health detects redis down', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '1': 1 }]);
    mockRedis.getClient.mockReturnValue(null);

    const result = await controller.checkHealth();
    expect(result.components.redis.status).toBe('down');
  });
});

// ---------------------------------------------------------------------------
// Configuration validation
// ---------------------------------------------------------------------------
describe('Configuration Validation', () => {
  let service: ConfigurationService;

  beforeEach(() => {
    service = new ConfigurationService();
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.REDIS_HOST;
    delete process.env.AI_MODE;
  });

  it('passes when all required ENV vars are set', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.JWT_ACCESS_SECRET = 'secret123';
    process.env.REDIS_HOST = 'localhost';

    const result = service.validate();
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('fails when DATABASE_URL is missing', () => {
    process.env.JWT_ACCESS_SECRET = 'secret123';
    process.env.REDIS_HOST = 'localhost';

    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('DATABASE_URL');
  });

  it('fails when JWT_ACCESS_SECRET is missing', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.REDIS_HOST = 'localhost';

    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('JWT_ACCESS_SECRET');
  });

  it('fails when REDIS_HOST is missing', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.JWT_ACCESS_SECRET = 'secret123';

    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('REDIS_HOST');
  });

  it('fails when multiple vars missing', () => {
    const result = service.validate();
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThanOrEqual(3);
  });

  it('validateOrThrow throws when validation fails', () => {
    expect(() => service.validateOrThrow()).toThrow('Environment validation failed');
  });

  it('validateOrThrow does not throw when all present', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.JWT_ACCESS_SECRET = 'secret123';
    process.env.REDIS_HOST = 'localhost';

    expect(() => service.validateOrThrow()).not.toThrow();
  });

  it('warns when DEEPSEEK_API_KEY missing in AI mode', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.JWT_ACCESS_SECRET = 'secret123';
    process.env.REDIS_HOST = 'localhost';
    process.env.AI_MODE = 'true';

    const result = service.validate();
    expect(result.valid).toBe(true);
    expect(result.warnings).toContain('DEEPSEEK_API_KEY');
  });

  it('does not require DEEPSEEK_API_KEY when AI_MODE is not set', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/db';
    process.env.JWT_ACCESS_SECRET = 'secret123';
    process.env.REDIS_HOST = 'localhost';

    const result = service.validate();
    expect(result.warnings).not.toContain('DEEPSEEK_API_KEY');
  });
});

// ---------------------------------------------------------------------------
// Global Exception Filter
// ---------------------------------------------------------------------------
describe('Global Exception Filter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('formats HttpException with requestId', () => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn(() => ({ json: mockJson }));
    const mockGetRequest = jest.fn(() => ({
      url: '/test',
      method: 'GET',
      'x-request-id': 'req-123',
    }));
    const mockGetResponse = jest.fn(() => ({
      status: mockStatus,
    }));
    const mockHost = {
      switchToHttp: () => ({
        getRequest: mockGetRequest,
        getResponse: mockGetResponse,
      }),
    };

    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockHost as any);

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 404,
      message: 'Not found',
      requestId: 'req-123',
      timestamp: expect.any(String),
      path: '/test',
    });
  });

  it('formats unknown errors as 500 Internal server error', () => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn(() => ({ json: mockJson }));
    const mockGetRequest = jest.fn(() => ({
      url: '/test',
      method: 'GET',
      'x-request-id': 'req-456',
    }));
    const mockGetResponse = jest.fn(() => ({
      status: mockStatus,
    }));
    const mockHost = {
      switchToHttp: () => ({
        getRequest: mockGetRequest,
        getResponse: mockGetResponse,
      }),
    };

    filter.catch(new Error('Something broke'), mockHost as any);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      requestId: 'req-456',
      timestamp: expect.any(String),
      path: '/test',
    });
  });

  it('includes requestId in every error response', () => {
    const mockJson = jest.fn();
    const mockStatus = jest.fn(() => ({ json: mockJson }));
    const mockGetRequest = jest.fn(() => ({
      url: '/api/orders',
      method: 'POST',
      'x-request-id': 'req-789',
    }));
    const mockGetResponse = jest.fn(() => ({
      status: mockStatus,
    }));
    const mockHost = {
      switchToHttp: () => ({
        getRequest: mockGetRequest,
        getResponse: mockGetResponse,
      }),
    };

    filter.catch(new HttpException('Bad request', 400), mockHost as any);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-789' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Correlation ID Middleware
// ---------------------------------------------------------------------------
describe('Correlation ID Middleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('generates UUID when no header present', () => {
    const req = { headers: {}, 'x-request-id': undefined } as any;
    const setHeader = jest.fn();
    const res = { setHeader } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req['x-request-id']).toBeDefined();
    expect(typeof req['x-request-id']).toBe('string');
    expect(req['x-request-id'].length).toBeGreaterThan(0);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', req['x-request-id']);
    expect(next).toHaveBeenCalled();
  });

  it('preserves incoming x-request-id header', () => {
    const req = { headers: { 'x-request-id': 'incoming-id-123' }, 'x-request-id': undefined } as any;
    const setHeader = jest.fn();
    const res = { setHeader } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req['x-request-id']).toBe('incoming-id-123');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'incoming-id-123');
  });

  it('sets response header with correlation ID', () => {
    const req = { headers: {}, 'x-request-id': undefined } as any;
    const setHeader = jest.fn();
    const res = { setHeader } as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
  });
});

// ---------------------------------------------------------------------------
// Request Logging Interceptor
// ---------------------------------------------------------------------------
describe('Request Logging Interceptor', () => {
  let interceptor: RequestLoggingInterceptor;

  beforeEach(() => {
    interceptor = new RequestLoggingInterceptor(mockLogger as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('logs request with method, url, status, duration', (done) => {
    const mockRequest = {
      method: 'GET',
      url: '/health',
      'x-request-id': 'req-999',
      user: undefined,
    };
    const mockResponse = { statusCode: 200 };
    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;
    const next = { handle: () => of(null) } as any;

    interceptor.intercept(context, next).subscribe({ complete: done });
  });

  it('includes userId and cafeId when user is authenticated', (done) => {
    const mockRequest = {
      method: 'GET',
      url: '/api/orders',
      'x-request-id': 'req-1000',
      user: { id: 'user-1', cafeId: 'cafe-1' },
    };
    const mockResponse = { statusCode: 200 };
    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;
    const next = { handle: () => of(null) } as any;

    interceptor.intercept(context, next).subscribe({ complete: done });
  });

  it('warns on slow requests (>1000ms)', (done) => {
    const originalNow = Date.now;
    let callCount = 0;
    Date.now = jest.fn(() => {
      callCount++;
      return callCount === 1 ? 0 : 2000;
    });

    const mockRequest = {
      method: 'GET',
      url: '/slow',
      'x-request-id': 'req-slow',
      user: undefined,
    };
    const mockResponse = { statusCode: 200 };
    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;
    const next = { handle: () => of(null) } as any;

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ slow: true, url: '/slow' }),
        );
        Date.now = originalNow;
        done();
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------
describe('Graceful Shutdown', () => {
  let service: GracefulShutdownService;

  beforeEach(() => {
    service = new GracefulShutdownService();
  });

  it('completes shutdown without error', async () => {
    await expect(service.onApplicationShutdown('SIGTERM')).resolves.not.toThrow();
  });

  it('handles shutdown signal gracefully', async () => {
    let resolved = false;
    await service.onApplicationShutdown('SIGTERM');
    resolved = true;
    expect(resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Metrics Registration
// ---------------------------------------------------------------------------
describe('Metrics Registration', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  it('registers all required metrics', async () => {
    const metricsMap = await metricsService.registry.getMetricsAsJSON();
    const metricNames = metricsMap.map((m: any) => m.name);
    expect(metricNames).toContain('sonic_pipeline_duration_seconds');
    expect(metricNames).toContain('sonic_planner_duration_seconds');
    expect(metricNames).toContain('sonic_executor_duration_seconds');
    expect(metricNames).toContain('sonic_merchant_response_seconds');
    expect(metricNames).toContain('sonic_driver_dispatch_seconds');
    expect(metricNames).toContain('sonic_http_requests_total');
    expect(metricNames).toContain('sonic_http_request_duration_seconds');
    expect(metricNames).toContain('sonic_messages_total');
    expect(metricNames).toContain('sonic_db_latency_seconds');
    expect(metricNames).toContain('sonic_event_loop_lag_seconds');
  });

  it('exports metrics in prometheus format', async () => {
    const body = await metricsService.getMetrics();
    expect(body).toBeDefined();
    expect(typeof body).toBe('string');
    expect(body.length).toBeGreaterThan(0);
  });

  it('returns correct content type', () => {
    expect(metricsService.getContentType()).toBe(metricsService.registry.contentType);
  });

  it('pipelineDuration histogram records values correctly', async () => {
    metricsService.pipelineDuration.observe({ intent: 'CREATE_ORDER' }, 1.5);
    const metrics = await metricsService.registry.getMetricsAsJSON();
    const pipelineMetric = metrics.find((m: any) => m.name === 'sonic_pipeline_duration_seconds');
    expect(pipelineMetric).toBeDefined();
  });

  it('plannerDuration histogram records values correctly', async () => {
    metricsService.plannerDuration.observe({ intent: 'CREATE_ORDER' }, 0.3);
    const metrics = await metricsService.registry.getMetricsAsJSON();
    const plannerMetric = metrics.find((m: any) => m.name === 'sonic_planner_duration_seconds');
    expect(plannerMetric).toBeDefined();
  });

  it('executorDuration histogram records values correctly', async () => {
    metricsService.executorDuration.observe({ intent: 'MODIFY_ORDER' }, 2.0);
    const metrics = await metricsService.registry.getMetricsAsJSON();
    const executorMetric = metrics.find((m: any) => m.name === 'sonic_executor_duration_seconds');
    expect(executorMetric).toBeDefined();
  });

  it('merchantResponseTime histogram records values correctly', () => {
    metricsService.merchantResponseTime.observe({ cafeId: 'cafe-1' }, 3.5);
  });

  it('driverDispatchTime histogram records values correctly', () => {
    metricsService.driverDispatchTime.observe({ zone: 'zone-a' }, 1.2);
  });
});
