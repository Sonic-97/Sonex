import { Injectable } from '@nestjs/common';
import { DeliveryZone } from '../../domain/aggregates/delivery-zone.aggregate';

export interface ETACalculationDetails {
  baseEtaMinutes: number;
  bufferMinutes: number;
  estimatedEtaMinutes: number;
  estimatedDeliveryTime: Date;
  confidenceScore: number;
}

@Injectable()
export class ETAEngineService {
  public calculateETA(
    zone: DeliveryZone,
    activeOrdersCount = 0,
    availableDriversCount = 1,
  ): ETACalculationDetails {
    const baseEta = zone.etaMinutes;
    let buffer = 0;

    // Adjust for order queue congestion
    if (activeOrdersCount > 10) {
      buffer += Math.min(25, Math.ceil((activeOrdersCount - 10) * 1.5));
    }

    // Adjust for low driver availability
    if (availableDriversCount === 0) {
      buffer += 20;
    } else if (availableDriversCount < 3 && activeOrdersCount > 5) {
      buffer += 10;
    }

    const estimatedEtaMinutes = baseEta + buffer;
    const estimatedDeliveryTime = new Date(Date.now() + estimatedEtaMinutes * 60 * 1000);

    const confidenceScore = Math.max(0.5, Number((1 - buffer / 60).toFixed(2)));

    return {
      baseEtaMinutes: baseEta,
      bufferMinutes: buffer,
      estimatedEtaMinutes,
      estimatedDeliveryTime,
      confidenceScore,
    };
  }
}
