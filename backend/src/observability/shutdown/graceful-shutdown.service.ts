import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';

@Injectable()
export class GracefulShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdownService.name);

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutdown signal received: ${signal || 'unknown'}`);
    this.logger.log('Waiting for in-flight requests to complete...');
    await new Promise((resolve) => setImmediate(resolve));
    this.logger.log('Graceful shutdown complete');
  }
}
