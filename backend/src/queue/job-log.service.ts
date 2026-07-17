import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class JobLogService {
  private readonly logger = new Logger(JobLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logStart(jobId: string, queueName: string, eventType: string | null, payload: Record<string, unknown>): Promise<string> {
    const log = await this.prisma.queueJobLog.create({
      data: {
        jobId,
        queueName,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        status: 'processing',
        attempts: 1,
      },
    });
    return log.id;
  }

  async logSuccess(logId: string, result: Record<string, unknown>): Promise<void> {
    await this.prisma.queueJobLog.update({
      where: { id: logId },
      data: {
        status: 'completed',
        result: result as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
  }

  async logFailure(logId: string, error: string, attempts: number): Promise<void> {
    await this.prisma.queueJobLog.update({
      where: { id: logId },
      data: {
        status: 'failed',
        error,
        attempts,
        completedAt: new Date(),
      },
    });
  }

  async getRecentJobs(limit = 50) {
    return this.prisma.queueJobLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getFailedJobs(limit = 50) {
    return this.prisma.queueJobLog.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getQueueStats(): Promise<
    Array<{ queueName: string; completed: number; failed: number; processing: number }>
  > {
    const result = await this.prisma.queueJobLog.groupBy({
      by: ['queueName', 'status'],
      _count: { id: true },
    });

    const statsMap: Record<string, { completed: number; failed: number; processing: number }> = {};

    for (const row of result) {
      if (!statsMap[row.queueName]) {
        statsMap[row.queueName] = { completed: 0, failed: 0, processing: 0 };
      }
      if (row.status === 'completed') statsMap[row.queueName].completed = row._count.id;
      else if (row.status === 'failed') statsMap[row.queueName].failed = row._count.id;
      else if (row.status === 'processing') statsMap[row.queueName].processing = row._count.id;
    }

    return Object.entries(statsMap).map(([queueName, stats]) => ({
      queueName,
      ...stats,
    }));
  }
}




