import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface SagaStep {
  name: string;
  execute: () => Promise<void>;
  compensate: () => Promise<void>;
}

@Injectable()
export class SagaOrchestratorService {
  private readonly logger = new Logger(SagaOrchestratorService.name);

  constructor(private readonly redisService: RedisService) {}

  async execute(correlationId: string, steps: SagaStep[]): Promise<void> {
    const completedSteps: string[] = [];

    try {
      for (const step of steps) {
        await step.execute();
        completedSteps.push(step.name);
        await this.redisService.exec(async (client) => {
          await client.set(`saga:${correlationId}:progress`, JSON.stringify(completedSteps));
        }, undefined).catch(() => {});
      }
    } catch (err) {
      this.logger.error(`Saga ${correlationId} failed at step "${completedSteps.length}": ${(err as Error).message}`);

      for (const stepName of completedSteps.reverse()) {
        const step = steps.find(s => s.name === stepName);
        if (step) {
          try {
            await step.compensate();
            this.logger.log(`Saga ${correlationId}: compensated step "${stepName}"`);
          } catch (compErr) {
            this.logger.error(`Saga ${correlationId}: compensation failed for step "${stepName}": ${(compErr as Error).message}`);
          }
        }
      }

      await this.redisService.exec(async (client) => {
        await client.set(`saga:${correlationId}:status`, 'failed');
      }, undefined).catch(() => {});

      throw err;
    }

    await this.redisService.exec(async (client) => {
      await client.set(`saga:${correlationId}:status`, 'completed');
    }, undefined).catch(() => {});
  }

  async getProgress(correlationId: string): Promise<{ completedSteps: string[]; status: string } | null> {
    return this.redisService.exec(async (client) => {
      const [progressRaw, status] = await Promise.all([
        client.get(`saga:${correlationId}:progress`),
        client.get(`saga:${correlationId}:status`),
      ]);
      if (!progressRaw && !status) return null;
      return {
        completedSteps: progressRaw ? JSON.parse(progressRaw) : [],
        status: status || 'running',
      };
    }, null);
  }
}
