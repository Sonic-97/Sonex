export const REVIEW_CATEGORIES = [
  'productQuality', 'preparationSpeed', 'deliverySpeed',
  'packaging', 'staffBehaviour', 'valueForMoney', 'overallSatisfaction',
] as const;
export type ReviewCategory = typeof REVIEW_CATEGORIES[number];

export const COMPLAINT_TYPES = [
  'Cold Coffee', 'Late Delivery', 'Wrong Order',
  'Poor Packaging', 'Missing Items',
] as const;
export type ComplaintType = typeof COMPLAINT_TYPES[number];

export const BADGE_TYPES = [
  'Fast Preparation', 'Top Rated', 'Fresh Products',
  'Reliable Merchant', 'Best Service',
] as const;
export type BadgeType = typeof BADGE_TYPES[number];

export const COMPLAINT_THRESHOLD = 3;
export const OLD_REVIEW_DAYS = 90;
export const REVIEW_WEIGHT_DECAY = 0.5;

export const CATEGORY_COMPLAINT_MAP: Record<string, ComplaintType> = {
  productQuality: 'Wrong Order',
  preparationSpeed: 'Cold Coffee',
  deliverySpeed: 'Late Delivery',
  packaging: 'Poor Packaging',
};

export interface ReviewInput {
  customerId: string;
  merchantId: string;
  merchantOrderId: string;
  ratings: Partial<Record<ReviewCategory, number>>;
  comment?: string;
}

export interface ReviewResult {
  reviewId: string;
  verified: boolean;
  complaints: ComplaintType[];
}

export interface TrustScore {
  merchantId: string;
  trustScore: number;
  totalReviews: number;
  averageRating: number;
  complaintCount: number;
  successRate: number;
  cancellationRate: number;
}

export interface QualityAlert {
  merchantId: string;
  complaintType: ComplaintType;
  count: number;
  threshold: number;
  generatedAt: string;
}

export interface MerchantBadge {
  merchantId: string;
  badge: BadgeType;
  awardedAt: string;
}

export interface MerchantRanking {
  merchantId: string;
  trustScore: number;
  badges: BadgeType[];
  alertCount: number;
}
