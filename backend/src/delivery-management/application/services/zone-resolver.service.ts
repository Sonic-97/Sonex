import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { IDeliveryZoneRepository } from '../../domain/repositories/delivery-zone.repository.interface';
import { GeoLocationService } from './geo-location.service';
import { DeliveryZone } from '../../domain/aggregates/delivery-zone.aggregate';

export interface ZoneResolutionResult {
  isSupported: boolean;
  zone?: DeliveryZone;
  branchId?: string;
  matchedBy?: 'STREET' | 'GPS' | 'DEFAULT_ZONE';
  deliveryFee?: number;
  minimumOrder?: number;
  etaMinutes?: number;
  nearestBranch?: {
    branchId: string;
    branchName?: string;
    distanceKm: number;
  };
  message?: string;
}

@Injectable()
export class ZoneResolverService {
  constructor(
    @Inject('IDeliveryZoneRepository')
    private readonly zoneRepository: IDeliveryZoneRepository,
    private readonly geoLocationService: GeoLocationService,
  ) {}

  public async resolveByStreetName(branchId: string, streetName: string): Promise<ZoneResolutionResult> {
    const zones = await this.zoneRepository.findByBranchId(branchId);
    if (!zones || zones.length === 0) {
      return {
        isSupported: false,
        message: 'No active delivery zones configured for this branch.',
      };
    }

    // Try matching main street or side street
    for (const zone of zones) {
      if (zone.matchesStreet(streetName)) {
        return {
          isSupported: true,
          zone,
          branchId: zone.branchId,
          matchedBy: 'STREET',
          deliveryFee: zone.deliveryFee,
          minimumOrder: zone.minimumOrder,
          etaMinutes: zone.etaMinutes,
        };
      }
    }

    return {
      isSupported: false,
      message: 'Location is outside the delivery area for this branch.',
    };
  }

  public async resolveByGpsCoordinates(
    branchId: string,
    latitude: number,
    longitude: number,
    allBranchLocations?: Array<{ id: string; name: string; lat: number; lng: number }>,
  ): Promise<ZoneResolutionResult> {
    const geocoded = await this.geoLocationService.reverseGeocode(latitude, longitude);

    // 1. First try matching the street extracted from reverse geocoding
    const streetResult = await this.resolveByStreetName(branchId, geocoded.mainStreet);
    if (streetResult.isSupported) {
      return {
        ...streetResult,
        matchedBy: 'GPS',
      };
    }

    // 2. If branch zones have street names matching sub-street or formatted address
    const zones = await this.zoneRepository.findByBranchId(branchId);
    for (const zone of zones) {
      if (geocoded.subStreet && zone.matchesStreet(geocoded.subStreet)) {
        return {
          isSupported: true,
          zone,
          branchId: zone.branchId,
          matchedBy: 'GPS',
          deliveryFee: zone.deliveryFee,
          minimumOrder: zone.minimumOrder,
          etaMinutes: zone.etaMinutes,
        };
      }
    }

    // 3. Outside delivery area handling - calculate distance to nearest branch
    let nearestBranch: { branchId: string; branchName?: string; distanceKm: number } | undefined;

    if (allBranchLocations && allBranchLocations.length > 0) {
      let minDistance = Infinity;
      for (const branchLoc of allBranchLocations) {
        const dist = this.geoLocationService.calculateDistanceKm(latitude, longitude, branchLoc.lat, branchLoc.lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestBranch = {
            branchId: branchLoc.id,
            branchName: branchLoc.name,
            distanceKm: dist,
          };
        }
      }
    }

    return {
      isSupported: false,
      nearestBranch,
      message: nearestBranch
        ? `Unfortunately this location is outside the delivery area. Nearest branch: ${nearestBranch.branchName || nearestBranch.branchId} (${nearestBranch.distanceKm} km away).`
        : 'Unfortunately this location is outside the delivery area.',
    };
  }
}
