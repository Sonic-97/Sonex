import { Injectable, BadRequestException } from '@nestjs/common';
import { DeliveryZone } from '../../domain/aggregates/delivery-zone.aggregate';

export interface DeliveryFeeCalculation {
  subtotal: number;
  deliveryFee: number;
  freeDeliveryThreshold?: number;
  isFreeDelivery: boolean;
  finalTotal: number;
  minimumOrder: number;
  isMinimumSatisfied: boolean;
  shortfall: number;
}

@Injectable()
export class DeliveryPolicyService {
  public calculateDeliveryPolicy(
    zone: DeliveryZone,
    orderSubtotal: number,
    freeDeliveryThreshold?: number,
  ): DeliveryFeeCalculation {
    const minCheck = zone.validateMinimumOrder(orderSubtotal);

    let isFreeDelivery = false;
    let effectiveFee = zone.deliveryFee;

    if (freeDeliveryThreshold !== undefined && freeDeliveryThreshold > 0 && orderSubtotal >= freeDeliveryThreshold) {
      isFreeDelivery = true;
      effectiveFee = 0;
    }

    const finalTotal = Number((orderSubtotal + effectiveFee).toFixed(2));

    return {
      subtotal: orderSubtotal,
      deliveryFee: effectiveFee,
      freeDeliveryThreshold,
      isFreeDelivery,
      finalTotal,
      minimumOrder: zone.minimumOrder,
      isMinimumSatisfied: minCheck.isSatisfied,
      shortfall: minCheck.shortfall,
    };
  }

  public enforceMinimumOrder(zone: DeliveryZone, orderSubtotal: number): void {
    const minCheck = zone.validateMinimumOrder(orderSubtotal);
    if (!minCheck.isSatisfied) {
      throw new BadRequestException(
        `Order subtotal (${orderSubtotal}) is below the minimum order amount (${zone.minimumOrder}) for zone '${zone.name}'. Please add ${minCheck.shortfall} more.`,
      );
    }
  }
}
