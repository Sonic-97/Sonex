import { Injectable } from '@nestjs/common';
import * as promClient from 'prom-client';

export type MetricLabels = Record<string, string>;

@Injectable()
export class MetricsService {
  readonly registry: promClient.Registry;

  // Message throughput
  readonly messageThroughput: promClient.Counter<string>;

  // OpenWA latency
  readonly openwaLatency: promClient.Histogram<string>;

  // Database latency
  readonly dbLatency: promClient.Histogram<string>;

  // Queue depth
  readonly queueDepth: promClient.Gauge<string>;

  // Failed sends
  readonly failedSends: promClient.Counter<string>;

  // Pending replies
  readonly pendingReplies: promClient.Gauge<string>;

  // Webhook health
  readonly webhookHealth: promClient.Gauge<string>;

  // Session health
  readonly sessionHealth: promClient.Gauge<string>;

  // HTTP request metrics
  readonly httpRequestCount: promClient.Counter<string>;
  readonly httpRequestDuration: promClient.Histogram<string>;

  // WS connection count
  readonly wsConnections: promClient.Gauge<string>;

  // Event loop lag
  readonly eventLoopLag: promClient.Gauge<string>;

  // Pipeline duration
  readonly pipelineDuration: promClient.Histogram<string>;

  // Planner duration
  readonly plannerDuration: promClient.Histogram<string>;

  // Executor duration
  readonly executorDuration: promClient.Histogram<string>;

  // Merchant response time
  readonly merchantResponseTime: promClient.Histogram<string>;

  // Driver dispatch time
  readonly driverDispatchTime: promClient.Histogram<string>;

  constructor() {
    this.registry = new promClient.Registry();
    promClient.collectDefaultMetrics({ register: this.registry });

    this.messageThroughput = new promClient.Counter({
      name: 'sonic_messages_total',
      help: 'Total messages processed',
      labelNames: ['direction', 'channel'],
      registers: [this.registry],
    });

    this.openwaLatency = new promClient.Histogram({
      name: 'sonic_openwa_latency_seconds',
      help: 'OpenWA operation latency',
      labelNames: ['operation'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.dbLatency = new promClient.Histogram({
      name: 'sonic_db_latency_seconds',
      help: 'Database query latency',
      labelNames: ['model', 'operation'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
      registers: [this.registry],
    });

    this.queueDepth = new promClient.Gauge({
      name: 'sonic_queue_depth',
      help: 'Current queue depth',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
    });

    this.failedSends = new promClient.Counter({
      name: 'sonic_failed_sends_total',
      help: 'Total failed message sends',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.pendingReplies = new promClient.Gauge({
      name: 'sonic_pending_replies',
      help: 'Number of unresolved pending replies',
      labelNames: ['cafe'],
      registers: [this.registry],
    });

    this.webhookHealth = new promClient.Gauge({
      name: 'sonic_webhook_health',
      help: 'Webhook registration health (1=up, 0=down)',
      labelNames: ['webhook'],
      registers: [this.registry],
    });

    this.sessionHealth = new promClient.Gauge({
      name: 'sonic_session_health',
      help: 'Session health state',
      labelNames: ['type', 'state'],
      registers: [this.registry],
    });

    this.httpRequestCount = new promClient.Counter({
      name: 'sonic_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new promClient.Histogram({
      name: 'sonic_http_request_duration_seconds',
      help: 'HTTP request duration',
      labelNames: ['method', 'path'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.wsConnections = new promClient.Gauge({
      name: 'sonic_ws_connections',
      help: 'Active WebSocket connections',
      labelNames: ['cafe', 'role'],
      registers: [this.registry],
    });

    this.eventLoopLag = new promClient.Gauge({
      name: 'sonic_event_loop_lag_seconds',
      help: 'Event loop lag',
      registers: [this.registry],
    });

    this.pipelineDuration = new promClient.Histogram({
      name: 'sonic_pipeline_duration_seconds',
      help: 'Commerce brain pipeline execution duration',
      labelNames: ['intent'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.plannerDuration = new promClient.Histogram({
      name: 'sonic_planner_duration_seconds',
      help: 'Action planner execution duration',
      labelNames: ['intent'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.executorDuration = new promClient.Histogram({
      name: 'sonic_executor_duration_seconds',
      help: 'Action executor execution duration',
      labelNames: ['intent'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.merchantResponseTime = new promClient.Histogram({
      name: 'sonic_merchant_response_seconds',
      help: 'Merchant response time via MCP',
      labelNames: ['cafeId'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.driverDispatchTime = new promClient.Histogram({
      name: 'sonic_driver_dispatch_seconds',
      help: 'Driver dispatch time',
      labelNames: ['zone'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
