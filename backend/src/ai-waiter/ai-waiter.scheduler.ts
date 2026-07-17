import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiWaiterService } from './ai-waiter.service';

@Injectable()
export class AiWaiterScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiWaiterScheduler.name);
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiWaiterService: AiWaiterService,
  ) {}

  onModuleInit() {
    this.logger.log('AiWaiterScheduler initialized — checking every 5 minutes');
    this.tick();
    this.timer = setInterval(() => this.tick(), this.CHECK_INTERVAL_MS);
  }

  private async tick() {
    try {
      this.aiWaiterService.cleanupExpiredOffers();

      const activeHabits = await this.prisma.customerHabit.findMany({
        where: { aiWaiterActive: true },
        select: { cafeId: true, customerId: true, usualTime: true, lastProactiveSentAt: true },
      });

      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      for (const habit of activeHabits) {
        if (!habit.usualTime) continue;

        if (habit.lastProactiveSentAt) {
          const sentDay = new Date(habit.lastProactiveSentAt);
          if (sentDay.toDateString() === now.toDateString()) continue;
        }

        const [hours, minutes] = habit.usualTime.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) continue;

        const targetMinutes = hours * 60 + minutes - 10;
        const diff = Math.abs(currentMinutes - targetMinutes);
        if (diff > 2) continue;

        this.aiWaiterService.trySendProactive(habit.cafeId, habit.customerId).catch(e => this.logger.error(`Send proactive failed: ${e.message}`));
      }
    } catch (err) {
      this.logger.error(`Scheduler tick error: ${(err as Error).message}`);
    }
  }
}
