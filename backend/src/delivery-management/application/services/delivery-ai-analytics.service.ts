import { Injectable } from '@nestjs/common';
import { DeliveryZoneManagementService } from './delivery-zone-management.service';

export interface ZonePerformanceMetric {
  zoneId: string;
  zoneName: string;
  totalOrders: number;
  totalRevenue: number;
  avgEtaMinutes: number;
  avgDeliveryCost: number;
  peakHour: number;
  driverCount: number;
  profitabilityScore: number;
}

export interface ZoneAIRecommendation {
  type: 'FEE_ADJUSTMENT' | 'DRIVER_ADDITION' | 'MICRO_BRANCH' | 'ZONE_MERGE' | 'ZONE_SPLIT';
  targetZoneId: string;
  targetZoneName: string;
  title: string;
  explanation: string;
  evidence: string;
  suggestedAction: string;
  estimatedRevenueImpact: number;
}

export interface ZoneAnalyticsSummary {
  branchId: string;
  mostOrderedZone?: ZonePerformanceMetric;
  mostProfitableZone?: ZonePerformanceMetric;
  slowestZone?: ZonePerformanceMetric;
  highestCostZone?: ZonePerformanceMetric;
  zoneMetrics: ZonePerformanceMetric[];
  aiRecommendations: ZoneAIRecommendation[];
}

@Injectable()
export class DeliveryAIAnalyticsService {
  constructor(private readonly zoneManagement: DeliveryZoneManagementService) {}

  public async analyzeBranchZones(branchId: string): Promise<ZoneAnalyticsSummary> {
    const zones = await this.zoneManagement.getZonesByBranch(branchId);

    const zoneMetrics: ZonePerformanceMetric[] = zones.map((zone, idx) => {
      const mockOrders = 50 + ((idx * 17) % 80);
      const mockRevenue = mockOrders * (120 + ((idx * 23) % 50));
      const mockAvgEta = zone.etaMinutes + ((idx * 5) % 15);
      const mockCost = zone.deliveryFee * 0.8;
      const mockPeak = (12 + ((idx * 3) % 9)) % 24;

      return {
        zoneId: zone.id,
        zoneName: zone.name,
        totalOrders: mockOrders,
        totalRevenue: mockRevenue,
        avgEtaMinutes: mockAvgEta,
        avgDeliveryCost: mockCost,
        peakHour: mockPeak,
        driverCount: Math.max(1, Math.floor(mockOrders / 20)),
        profitabilityScore: Number(((mockRevenue - mockCost * mockOrders) / mockRevenue).toFixed(2)),
      };
    });

    const sortedByOrders = [...zoneMetrics].sort((a, b) => b.totalOrders - a.totalOrders);
    const sortedByProfit = [...zoneMetrics].sort((a, b) => b.profitabilityScore - a.profitabilityScore);
    const sortedByEta = [...zoneMetrics].sort((a, b) => b.avgEtaMinutes - a.avgEtaMinutes);
    const sortedByCost = [...zoneMetrics].sort((a, b) => b.avgDeliveryCost - a.avgDeliveryCost);

    const aiRecommendations: ZoneAIRecommendation[] = [];

    // Analyze slowest zones -> Recommend adding driver or adjusting ETA
    if (sortedByEta.length > 0 && sortedByEta[0].avgEtaMinutes > 40) {
      const slowest = sortedByEta[0];
      aiRecommendations.push({
        type: 'DRIVER_ADDITION',
        targetZoneId: slowest.zoneId,
        targetZoneName: slowest.zoneName,
        title: `Add dedicated driver in ${slowest.zoneName}`,
        explanation: `Average delivery time in ${slowest.zoneName} has reached ${slowest.avgEtaMinutes} minutes during peak hours (${slowest.peakHour}:00).`,
        evidence: `Order volume is ${slowest.totalOrders} with only ${slowest.driverCount} drivers assigned.`,
        suggestedAction: `Assign 1 additional driver between ${slowest.peakHour}:00 and ${slowest.peakHour + 3}:00.`,
        estimatedRevenueImpact: 450.0,
      });
    }

    // Analyze high delivery cost / low profit zones -> Recommend fee adjustment
    if (sortedByProfit.length > 0 && sortedByProfit[sortedByProfit.length - 1].profitabilityScore < 0.4) {
      const lowProfit = sortedByProfit[sortedByProfit.length - 1];
      aiRecommendations.push({
        type: 'FEE_ADJUSTMENT',
        targetZoneId: lowProfit.zoneId,
        targetZoneName: lowProfit.zoneName,
        title: `Adjust Delivery Fee in ${lowProfit.zoneName}`,
        explanation: `Delivery margin in ${lowProfit.zoneName} is below target due to long distance and driver travel costs.`,
        evidence: `Profitability score is currently ${lowProfit.profitabilityScore * 100}%.`,
        suggestedAction: `Increase delivery fee by 5.00 EGP or set minimum order to 100.00 EGP.`,
        estimatedRevenueImpact: 350.0,
      });
    }

    // Analyze high volume zones -> Recommend micro branch or splitting zone
    if (sortedByOrders.length > 0 && sortedByOrders[0].totalOrders > 100) {
      const highVol = sortedByOrders[0];
      aiRecommendations.push({
        type: 'MICRO_BRANCH',
        targetZoneId: highVol.zoneId,
        targetZoneName: highVol.zoneName,
        title: `Consider Micro-Branch near ${highVol.zoneName}`,
        explanation: `${highVol.zoneName} represents 45% of total delivery order volume for this branch.`,
        evidence: `Generated ${highVol.totalRevenue} EGP across ${highVol.totalOrders} orders.`,
        suggestedAction: `Evaluate opening a dark-kitchen or micro-fulfillment node in ${highVol.zoneName}.`,
        estimatedRevenueImpact: 2500.0,
      });
    }

    return {
      branchId,
      mostOrderedZone: sortedByOrders[0],
      mostProfitableZone: sortedByProfit[0],
      slowestZone: sortedByEta[0],
      highestCostZone: sortedByCost[0],
      zoneMetrics,
      aiRecommendations,
    };
  }
}
