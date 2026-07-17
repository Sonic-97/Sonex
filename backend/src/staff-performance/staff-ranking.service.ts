import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StaffRankingService {
  constructor(private readonly prisma: PrismaService) {}

  async dailyRanking(cafeId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.buildRanking(today);
  }

  async weeklyRanking(cafeId?: string) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    return this.buildRangeRanking(weekStart, new Date());
  }

  async monthlyRanking(cafeId?: string) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    return this.buildRangeRanking(monthStart, new Date());
  }

  async compareStaffPerformance(staffA: string, staffB: string, cafeId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [staffAInfo, staffBInfo] = await Promise.all([
      this.prisma.staff.findUnique({ where: { id: staffA }, select: { name: true, role: true, cafeId: true } }),
      this.prisma.staff.findUnique({ where: { id: staffB }, select: { name: true, role: true, cafeId: true } }),
    ]);

    const [perfA, perfB] = await Promise.all([
      this.prisma.staffPerformance.findUnique({
        where: { cafeId_staffId_date: { cafeId: staffAInfo?.cafeId ?? '', staffId: staffA, date: today } },
      }),
      this.prisma.staffPerformance.findUnique({
        where: { cafeId_staffId_date: { cafeId: staffBInfo?.cafeId ?? '', staffId: staffB, date: today } },
      }),
    ]);

    return {
      staffA: {
        staffId: staffA,
        staffName: staffAInfo?.name || 'Unknown',
        performance: perfA || null,
      },
      staffB: {
        staffId: staffB,
        staffName: staffBInfo?.name || 'Unknown',
        performance: perfB || null,
      },
      comparison: perfA && perfB ? {
        winner: perfA.overallScore > perfB.overallScore ? staffA : staffB,
        winnerName: perfA.overallScore > perfB.overallScore
          ? (staffAInfo?.name || 'Unknown')
          : (staffBInfo?.name || 'Unknown'),
        margin: Math.abs(perfA.overallScore - perfB.overallScore),
        detail: {
          overall: `${perfA.overallScore} vs ${perfB.overallScore}`,
          revenue: `${perfA.revenueScore} vs ${perfB.revenueScore}`,
          efficiency: `${perfA.efficiencyScore} vs ${perfB.efficiencyScore}`,
          speed: `${perfA.speedScore} vs ${perfB.speedScore}`,
          reliability: `${perfA.reliabilityScore} vs ${perfB.reliabilityScore}`,
        },
      } : null,
    };
  }

  private async buildRanking(date: Date) {
    const performances = await this.prisma.staffPerformance.findMany({
      where: { date },
      orderBy: { overallScore: 'desc' },
      include: { staff: true },
    });

    return this.formatRanking(performances as any[]);
  }

  private async buildRangeRanking(from: Date, to: Date) {
    // Aggregate scores across date range
    const performances = await this.prisma.staffPerformance.findMany({
      where: {
        date: { gte: from, lte: to },
      },
      include: { staff: true },
      orderBy: { overallScore: 'desc' },
    });

    // Group by staffId and average the scores
    const grouped = new Map<string, {
      staff: any;
      scores: number[];
      orders: number;
      revenue: number;
    }>();

    for (const p of performances as any[]) {
      const existing = grouped.get(p.staffId) || {
        staff: p.staff,
        scores: [],
        orders: 0,
        revenue: 0,
      };
      existing.scores.push(p.overallScore);
      existing.orders += p.ordersHandled;
      existing.revenue += Number(p.totalRevenue);
      grouped.set(p.staffId, existing);
    }

    const ranked = Array.from(grouped.entries())
      .map(([staffId, data]) => ({
        rank: 0,
        staffId,
        staffName: data.staff?.name || 'Unknown',
        role: data.staff?.role || 'Unknown',
        avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
        totalOrders: data.orders,
        totalRevenue: Math.round(data.revenue * 100) / 100,
        daysTracked: data.scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    return ranked;
  }

  private formatRanking(performances: any[]) {
    return performances.map((p, i) => ({
      rank: i + 1,
      staffId: p.staffId,
      staffName: p.staff?.name || 'Unknown',
      role: p.staff?.role || 'Unknown',
      overallScore: p.overallScore,
      ordersHandled: p.ordersHandled,
      totalRevenue: Number(p.totalRevenue),
      revenueScore: p.revenueScore,
      efficiencyScore: p.efficiencyScore,
      speedScore: p.speedScore,
      reliabilityScore: p.reliabilityScore,
    }));
  }
}




