import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerLocation } from '../../domain/aggregates/customer-location.aggregate';
import { DeliveryZone } from '../../domain/aggregates/delivery-zone.aggregate';

export interface DriverDeliveryPayload {
  orderId: string;
  customerName: string;
  customerPhone: string;
  zoneName: string;
  mainStreet: string;
  subStreet?: string | null;
  buildingNumber?: string | null;
  floor?: string | null;
  apartment?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsDeepLink: string;
  formattedAddress: string;
  deliveryFee: number;
  etaMinutes: number;
  assignedAt: Date;
}

@Injectable()
export class DriverAssignmentService {
  public generateDriverPayload(
    orderId: string,
    customerName: string,
    customerPhone: string,
    location: CustomerLocation,
    zone: DeliveryZone,
  ): DriverDeliveryPayload {
    if (!location) {
      throw new NotFoundException('Delivery location is required to generate driver payload.');
    }

    const googleMapsDeepLink = location.getGoogleMapsDeepLink();
    const formattedAddress = location.toFormattedAddressString();

    return {
      orderId,
      customerName,
      customerPhone,
      zoneName: zone.name,
      mainStreet: location.mainStreet,
      subStreet: location.subStreet,
      buildingNumber: location.buildingNumber,
      floor: location.floor,
      apartment: location.apartment,
      landmark: location.landmark,
      latitude: location.latitude,
      longitude: location.longitude,
      googleMapsDeepLink,
      formattedAddress,
      deliveryFee: zone.deliveryFee,
      etaMinutes: zone.etaMinutes,
      assignedAt: new Date(),
    };
  }
}
