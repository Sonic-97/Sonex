import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReviewInput, ReviewResult, TrustScore, QualityAlert, MerchantBadge,
  MerchantRanking, ReviewCategory, ComplaintType, BadgeType,
  REVIEW_CATEGORIES, COMPLAINT_TYPES, COMPLAINT_THRESHOLD,
  OLD_REVIEW_DAYS, REVIEW_WEIGHT_DECAY, CATEGORY_COMPLAINT_MAP,
} from './trust-reputation.types';

@Injectable()
export class TrustReputationService {
  private readonly logger = new Logger(TrustReputationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitReview(input: ReviewInput): Promise<ReviewResult> {
    const order = await this.prisma.merchantOrder.findUnique({
      where: { id: input.merchantOrderId },
      select: { status: true, cafeId: true, customerOrder: { select: { customerId: true } } },
    });
    if (!order || order.status !== 'COMPLETED') {
      throw new Error('Order must be COMPLETED to review');
    }
    if (order.cafeId !== input.merchantId) {
      throw new Error('Order does not belong to this merchant');
    }
    if (order.customerOrder.customerId !== input.customerId) {
      throw new Error('Order does not belong to this customer');
    }

    const existing = await this.prisma.merchantReview.findUnique({
      where: { merchantOrderId: input.merchantOrderId },
    });
    if (existing) {
      throw new Error('Review already submitted for this order');
    }

    const ratings: Record<string, number> = {};
    for (const cat of REVIEW_CATEGORIES) {
      if (input.ratings[cat] != null) {
        ratings[cat] = Math.max(1, Math.min(5, Math.round(input.ratings[cat]!)));
      } else {
        ratings[cat] = 0;
      }
    }

    const record = await this.prisma.merchantReview.create({
      data: {
        customerId: input.customerId,
        merchantId: input.merchantId,
        merchantOrderId: input.merchantOrderId,
        ratings,
        comment: input.comment,
        verified: true,
      },
    });

    const complaints = this.detectComplaints(ratings);

    await this.recalculateReputation(input.merchantId);

    return { reviewId: record.id, verified: true, complaints };
  }

  async getMerchantReviews(merchantId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      this.prisma.merchantReview.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.merchantReview.count({ where: { merchantId } }),
    ]);
    return { reviews, total, page, limit };
  }

  async getReputation(merchantId: string): Promise<TrustScore | null> {
    const rep = await this.prisma.merchantReputation.findUnique({
      where: { merchantId },
    });
    if (!rep) return null;
    return {
      merchantId: rep.merchantId,
      trustScore: Number(rep.trustScore),
      totalReviews: rep.totalReviews,
      averageRating: Number(rep.averageRating),
      complaintCount: rep.complaintCount,
      successRate: Number(rep.successRate),
      cancellationRate: Number(rep.cancellationRate),
    };
  }

  async getMerchantBadges(merchantId: string): Promise<MerchantBadge[]> {
    const rep = await this.prisma.merchantReputation.findUnique({
      where: { merchantId },
    });
    if (!rep) return [];
    return (rep.badges as any[]).map((b: any) => ({
      merchantId,
      badge: (b.badge || b.type) as BadgeType,
      awardedAt: b.awardedAt,
    }));
  }

  async getQualityAlerts(merchantId: string): Promise<QualityAlert[]> {
    const rep = await this.prisma.merchantReputation.findUnique({
      where: { merchantId },
    });
    if (!rep) return [];
    return (rep.alerts as any[]).map((a: any) => ({
      merchantId,
      complaintType: (a.complaintType || a.type) as ComplaintType,
      count: a.count,
      threshold: COMPLAINT_THRESHOLD,
      generatedAt: a.generatedAt,
    }));
  }

  async getRankedMerchants(merchantIds: string[]): Promise<MerchantRanking[]> {
    const reps = await this.prisma.merchantReputation.findMany({
      where: { merchantId: { in: merchantIds } },
    });

    return reps
      .map(r => ({
        merchantId: r.merchantId,
        trustScore: Number(r.trustScore),
        badges: (r.badges as any[]).map((b: any) => b.type as BadgeType),
        alertCount: (r.alerts as any[]).length,
      }))
      .sort((a, b) => b.trustScore - a.trustScore);
  }

  async recalculateReputation(merchantId: string): Promise<void> {
    const [reviews, completedOrders, totalOrders] = await Promise.all([
      this.prisma.merchantReview.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.merchantOrder.count({
        where: { cafeId: merchantId, status: 'COMPLETED' },
      }),
      this.prisma.merchantOrder.count({
        where: { cafeId: merchantId, status: { notIn: ['CANCELLED', 'REJECTED'] } },
      }),
    ]);

    const totalReviews = reviews.length;
    const now = Date.now();
    let weightedSum = 0;
    let weightTotal = 0;
    let complaintCount = 0;
    const complaintFrequency: Record<string, number> = {};
    const alertList: QualityAlert[] = [];

    for (const review of reviews) {
      const ageDays = (now - review.createdAt.getTime()) / 86400000;
      const weight = ageDays > OLD_REVIEW_DAYS ? REVIEW_WEIGHT_DECAY : 1;
      const ratings = review.ratings as Record<string, number>;

      let reviewAvg = 0;
      let reviewCatCount = 0;
      for (const cat of REVIEW_CATEGORIES) {
        const val = ratings[cat];
        if (val && val > 0) {
          reviewAvg += val * weight;
          reviewCatCount++;
        }
      }
      if (reviewCatCount > 0) {
        weightedSum += reviewAvg;
        weightTotal += weight * reviewCatCount;
      }

      const detected = this.detectComplaints(ratings);
      for (const c of detected) {
        complaintCount++;
        complaintFrequency[c] = (complaintFrequency[c] || 0) + 1;
      }
    }

    for (const [type, count] of Object.entries(complaintFrequency)) {
      if (count >= COMPLAINT_THRESHOLD) {
        alertList.push({
          merchantId,
          complaintType: type as ComplaintType,
          count,
          threshold: COMPLAINT_THRESHOLD,
          generatedAt: new Date().toISOString(),
        });
      }
    }

    const averageRating = weightTotal > 0 ? weightedSum / weightTotal : 0;
    const successRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
    const cancellationRate = totalOrders > 0 ? 100 - successRate : 0;
    const reviewScore = averageRating > 0 ? (averageRating / 5) * 40 : 0;
    const complaintPenalty = Math.max(0, 30 - complaintCount * 5);
    const successScore = successRate * 0.3;
    const trustScore = Math.min(100, Math.round(reviewScore + complaintPenalty + successScore));

    const badges = this.assignBadges(averageRating, complaintCount, successRate, reviews.length);

    await this.prisma.merchantReputation.upsert({
      where: { merchantId },
      create: {
        merchantId,
        trustScore,
        totalReviews,
        averageRating,
        complaintCount,
        successRate,
        cancellationRate,
        badges: badges as any,
        alerts: alertList as any,
        lastCalculated: new Date(),
      },
      update: {
        trustScore,
        totalReviews,
        averageRating,
        complaintCount,
        successRate,
        cancellationRate,
        badges: badges as any,
        alerts: alertList as any,
        lastCalculated: new Date(),
      },
    });
  }

  detectComplaints(ratings: Record<string, number>): ComplaintType[] {
    const complaints: ComplaintType[] = [];
    for (const [category, complaintType] of Object.entries(CATEGORY_COMPLAINT_MAP)) {
      if ((ratings[category] || 0) > 0 && (ratings[category] || 0) < 3) {
        if (!complaints.includes(complaintType as ComplaintType)) {
          complaints.push(complaintType as ComplaintType);
        }
      }
    }
    return complaints;
  }

  private assignBadges(avgRating: number, complaintCount: number, successRate: number, reviewCount: number): MerchantBadge[] {
    const badges: MerchantBadge[] = [];
    const now = new Date().toISOString();

    if (avgRating >= 4.5 && reviewCount >= 5) {
      badges.push({ badge: 'Top Rated', awardedAt: now } as MerchantBadge);
    }
    if (avgRating >= 4.0 && successRate >= 95 && complaintCount === 0) {
      badges.push({ badge: 'Reliable Merchant', awardedAt: now } as MerchantBadge);
    }
    if (successRate >= 98) {
      badges.push({ badge: 'Fast Preparation', awardedAt: now } as MerchantBadge);
    }
    if (complaintCount === 0 && reviewCount >= 3) {
      badges.push({ badge: 'Fresh Products', awardedAt: now } as MerchantBadge);
    }
    if (avgRating >= 4.0 && reviewCount >= 3) {
      badges.push({ badge: 'Best Service', awardedAt: now } as MerchantBadge);
    }

    return badges;
  }
}
