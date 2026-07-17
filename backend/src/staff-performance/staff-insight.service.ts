import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent } from '../events/events.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class StaffInsightService {
  private readonly logger = new Logger(StaffInsightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  @OnEvent('staff.performance.updated')
  async onPerformanceUpdated(event: AppEvent) {
    const payload = event.payload as { staffId: string };
    const insights = await this.generateInsights(payload.staffId);
    if (insights.length > 0) {
      this.eventsService.emitToOwner('staff.insight.generated', {
        staffId: payload.staffId,
        insights,
      });
    }
  }

  async generateInsights(staffId: string) {
    const insights: { type: string; message: string; trend: 'up' | 'down' | 'stable' }[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get last 7 days of performance data
    const history = await this.prisma.staffPerformance.findMany({
      where: {
        staffId,
        date: { gte: new Date(today.getTime() - 7 * 86400000) },
      },
      orderBy: { date: 'asc' },
    });

    if (history.length < 2) {
      insights.push({
        type: 'INSUFFICIENT_DATA',
        message: 'Not enough performance data yet — continue working to generate insights',
        trend: 'stable',
      });
      return insights;
    }

    const current = history[history.length - 1];
    const previous = history.length >= 2 ? history[history.length - 2] : null;

    if (previous) {
      const scoreChange = current.overallScore - previous.overallScore;
      const revenueChange = Number(current.totalRevenue) - Number(previous.totalRevenue);
      const speedChange = current.avgOrderProcessingTime - previous.avgOrderProcessingTime;
      const cancelChange = current.cancellationCount - previous.cancellationCount;

      // Overall trend
      if (scoreChange > 5) {
        insights.push({
          type: 'IMPROVING',
          message: `Performance improved by ${scoreChange} points compared to yesterday`,
          trend: 'up',
        });
      } else if (scoreChange < -5) {
        insights.push({
          type: 'DECLINING',
          message: `Performance dropped by ${Math.abs(scoreChange)} points compared to yesterday`,
          trend: 'down',
        });
      }

      // Revenue trend
      if (revenueChange > 50) {
        insights.push({
          type: 'REVENUE_UP',
          message: `Revenue contribution increased by $${revenueChange.toFixed(2)}`,
          trend: 'up',
        });
      } else if (revenueChange < -50) {
        insights.push({
          type: 'REVENUE_DOWN',
          message: `Revenue contribution dropped by $${Math.abs(revenueChange).toFixed(2)}`,
          trend: 'down',
        });
      }

      // Speed trend
      if (speedChange < -2 && speedChange !== 0) {
        insights.push({
          type: 'SPEED_IMPROVED',
          message: `Order processing speed improved by ${Math.abs(speedChange).toFixed(1)} minutes`,
          trend: 'up',
        });
      } else if (speedChange > 2) {
        insights.push({
          type: 'SPEED_DECLINED',
          message: `Order processing slowed by ${speedChange.toFixed(1)} minutes`,
          trend: 'down',
        });
      }

      // Cancellation trend
      if (cancelChange > 1) {
        insights.push({
          type: 'CANCELLATION_INCREASE',
          message: `Cancellations increased by ${cancelChange} compared to yesterday`,
          trend: 'down',
        });
      }
    }

    // Current state insights
    if (current.overallScore >= 80) {
      insights.push({
        type: 'EXCELLENT',
        message: `Excellent performance score of ${current.overallScore}/100 — top tier!`,
        trend: 'up',
      });
    } else if (current.overallScore < 40) {
      insights.push({
        type: 'NEEDS_IMPROVEMENT',
        message: `Performance score of ${current.overallScore}/100 needs attention`,
        trend: 'down',
      });
    }

    if (current.speedScore < 30) {
      insights.push({
        type: 'SPEED_WARNING',
        message: `Average processing time of ${current.avgOrderProcessingTime} minutes is too slow`,
        trend: 'down',
      });
    }

    if (current.completionRate < 80) {
      insights.push({
        type: 'RELIABILITY_WARNING',
        message: `Completion rate of ${current.completionRate}% is below target (80%)`,
        trend: 'down',
      });
    }

    return insights;
  }

  async getStaffInsights(staffId: string, cafeId?: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    const insights = await this.generateInsights(staffId);

    return {
      staffId,
      staffName: staff?.name || 'Unknown',
      insights,
    };
  }
}




