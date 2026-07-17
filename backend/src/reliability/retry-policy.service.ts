import { Injectable, Logger } from '@nestjs/common';

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  strategy: 'exponential' | 'linear' | 'fixed';
  maxDelayMs: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRIES: Record<string, RetryConfig> = {
  'webhook-register': { maxAttempts: 3, baseDelayMs: 2000, strategy: 'exponential', maxDelayMs: 16000, retryableStatuses: [408, 429, 500, 502, 503, 504] },
  'whatsapp-send': { maxAttempts: 3, baseDelayMs: 1000, strategy: 'exponential', maxDelayMs: 9000, retryableStatuses: [408, 429, 500, 502, 503, 504] },
  'openwa-contact-phone': { maxAttempts: 2, baseDelayMs: 2000, strategy: 'linear', maxDelayMs: 6000 },
  'openwa-contact-details': { maxAttempts: 2, baseDelayMs: 2000, strategy: 'linear', maxDelayMs: 6000 },
  'ai-parse': { maxAttempts: 2, baseDelayMs: 1000, strategy: 'exponential', maxDelayMs: 3000, retryableStatuses: [408, 429, 500, 502, 503, 504] },
  'inventory-db': { maxAttempts: 5, baseDelayMs: 500, strategy: 'exponential', maxDelayMs: 8000, retryableStatuses: [400, 409, 503] },
};

export class RetryExhaustedError extends Error {
  constructor(public readonly operation: string, public readonly lastError: Error, public readonly attempts: number) {
    super(`Retry exhausted for ${operation} after ${attempts} attempts: ${lastError.message}`);
    this.name = 'RetryExhaustedError';
  }
}

@Injectable()
export class RetryPolicyService {
  private readonly logger = new Logger(RetryPolicyService.name);

  getConfig(operation: string): RetryConfig {
    return DEFAULT_RETRIES[operation] ?? { maxAttempts: 1, baseDelayMs: 1000, strategy: 'fixed', maxDelayMs: 3000 };
  }

  async execute<T>(operation: string, fn: () => Promise<T>, traceId?: string): Promise<T> {
    const config = this.getConfig(operation);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const axiosErr = (err as any)?.response;
        const status = axiosErr?.status;

        if (status && config.retryableStatuses && !config.retryableStatuses.includes(status)) {
          this.logger.debug(`[Retry:${operation}] Non-retryable status ${status}, propagating immediately`);
          throw err;
        }

        if (attempt === config.maxAttempts) {
          this.logger.warn(`[Retry:${operation}] All ${config.maxAttempts} attempts failed${traceId ? ` [${traceId}]` : ''}: ${lastError.message}`);
          throw new RetryExhaustedError(operation, lastError, attempt);
        }

        const delay = this.computeDelay(config, attempt);
        this.logger.debug(`[Retry:${operation}] Attempt ${attempt}/${config.maxAttempts} failed, retrying in ${delay}ms${traceId ? ` [${traceId}]` : ''}: ${lastError.message}`);
        await this.sleep(delay);
      }
    }

    throw lastError ?? new Error(`Retry ${operation} failed with no error`);
  }

  private computeDelay(config: RetryConfig, attempt: number): number {
    switch (config.strategy) {
      case 'exponential':
        return Math.min(config.baseDelayMs * Math.pow(2, attempt - 1), config.maxDelayMs);
      case 'linear':
        return Math.min(config.baseDelayMs * attempt, config.maxDelayMs);
      case 'fixed':
      default:
        return Math.min(config.baseDelayMs, config.maxDelayMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
