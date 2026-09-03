import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { ICustomerLocationRepository } from '../../domain/repositories/customer-location.repository.interface';
import { CustomerLocation, CustomerLocationProps } from '../../domain/aggregates/customer-location.aggregate';
import { ZoneResolverService, ZoneResolutionResult } from './zone-resolver.service';
import { GeoLocationService } from './geo-location.service';

export interface LocationChoiceResult {
  location: CustomerLocation;
  resolution: ZoneResolutionResult;
  promptChoiceRequired: boolean;
  promptMessage?: string;
}

export type LocationOverrideDecision = 'USE_ONCE' | 'SAVE_NEW' | 'REPLACE_DEFAULT';

@Injectable()
export class CustomerLocationService {
  constructor(
    @Inject('ICustomerLocationRepository')
    private readonly locationRepository: ICustomerLocationRepository,
    private readonly zoneResolver: ZoneResolverService,
    private readonly geoLocation: GeoLocationService,
  ) {}

  public async getCustomerLocations(customerId: string): Promise<CustomerLocation[]> {
    return this.locationRepository.findByCustomerId(customerId);
  }

  public async getDefaultLocation(customerId: string): Promise<CustomerLocation | null> {
    return this.locationRepository.findDefaultByCustomerId(customerId);
  }

  public async saveCustomerLocation(props: Omit<CustomerLocationProps, 'id'> & { id?: string }): Promise<CustomerLocation> {
    const id = props.id || `loc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const location = new CustomerLocation({
      ...props,
      id,
    });
    return this.locationRepository.save(location);
  }

  public async setDefaultLocation(customerId: string, locationId: string): Promise<void> {
    const loc = await this.locationRepository.findById(locationId);
    if (!loc || loc.customerId !== customerId) {
      throw new NotFoundException('Customer location not found.');
    }
    await this.locationRepository.setDefault(customerId, locationId);
  }

  public async deleteLocation(customerId: string, locationId: string): Promise<void> {
    const loc = await this.locationRepository.findById(locationId);
    if (!loc || loc.customerId !== customerId) {
      throw new NotFoundException('Customer location not found.');
    }
    await this.locationRepository.delete(locationId);
  }

  /**
   * Handles incoming GPS location or Address from WhatsApp flow.
   */
  public async handleIncomingGpsLocation(
    customerId: string,
    branchId: string,
    latitude: number,
    longitude: number,
    additionalDetails?: {
      label?: string;
      buildingNumber?: string;
      floor?: string;
      apartment?: string;
      landmark?: string;
    },
  ): Promise<LocationChoiceResult> {
    // 1. Resolve GPS coordinates against Delivery Zones
    const resolution = await this.zoneResolver.resolveByGpsCoordinates(branchId, latitude, longitude);

    if (!resolution.isSupported) {
      throw new BadRequestException(resolution.message || 'Location is outside delivery area.');
    }

    // Reverse geocode to get street details
    const geocoded = await this.geoLocation.reverseGeocode(latitude, longitude);

    // 2. Check if customer already has a default location
    const defaultLoc = await this.locationRepository.findDefaultByCustomerId(customerId);

    if (!defaultLoc) {
      // First order flow: Save location automatically as default
      const newLoc = await this.saveCustomerLocation({
        customerId,
        branchId,
        zoneId: resolution.zone?.id,
        label: additionalDetails?.label || 'Home',
        mainStreet: geocoded.mainStreet,
        subStreet: geocoded.subStreet,
        buildingNumber: additionalDetails?.buildingNumber,
        floor: additionalDetails?.floor,
        apartment: additionalDetails?.apartment,
        landmark: additionalDetails?.landmark,
        latitude,
        longitude,
        isDefault: true,
        lastUsedAt: new Date(),
      });

      return {
        location: newLoc,
        resolution,
        promptChoiceRequired: false,
      };
    }

    // Customer has an existing default address
    // Determine if it's the same zone or different zone
    const isSameZone = defaultLoc.zoneId === resolution.zone?.id;

    if (isSameZone) {
      // Same zone: Use temporarily without requiring prompt choice
      const tempLoc = new CustomerLocation({
        id: `loc_temp_${Date.now()}`,
        customerId,
        branchId,
        zoneId: resolution.zone?.id,
        label: additionalDetails?.label || 'Temporary',
        mainStreet: geocoded.mainStreet,
        subStreet: geocoded.subStreet,
        buildingNumber: additionalDetails?.buildingNumber,
        floor: additionalDetails?.floor,
        apartment: additionalDetails?.apartment,
        landmark: additionalDetails?.landmark,
        latitude,
        longitude,
        isDefault: false,
        lastUsedAt: new Date(),
      });

      return {
        location: tempLoc,
        resolution,
        promptChoiceRequired: false,
      };
    }

    // Different zone detected: Requires customer decision prompt
    const newLocDraft = new CustomerLocation({
      id: `loc_draft_${Date.now()}`,
      customerId,
      branchId,
      zoneId: resolution.zone?.id,
      label: additionalDetails?.label || 'New Address',
      mainStreet: geocoded.mainStreet,
      subStreet: geocoded.subStreet,
      buildingNumber: additionalDetails?.buildingNumber,
      floor: additionalDetails?.floor,
      apartment: additionalDetails?.apartment,
      landmark: additionalDetails?.landmark,
      latitude,
      longitude,
      isDefault: false,
    });

    const promptMessage =
      'تم اكتشاف موقع في منطقة توصيل جديدة. ماذا تود أن تفعل؟\n' +
      '1️⃣ استخدام لهذا الطلب فقط\n' +
      '2️⃣ حفظ كعنوان جديد\n' +
      '3️⃣ استبدال عنوانك الرئيسي الحالي';

    return {
      location: newLocDraft,
      resolution,
      promptChoiceRequired: true,
      promptMessage,
    };
  }

  /**
   * Processes customer decision choice for a new zone location.
   */
  public async applyLocationOverrideChoice(
    customerId: string,
    locationDraft: CustomerLocationProps,
    decision: LocationOverrideDecision,
  ): Promise<CustomerLocation> {
    switch (decision) {
      case 'SAVE_NEW':
        return this.saveCustomerLocation({
          ...locationDraft,
          id: undefined,
          customerId,
          isDefault: false,
          lastUsedAt: new Date(),
        });

      case 'REPLACE_DEFAULT':
        return this.saveCustomerLocation({
          ...locationDraft,
          id: undefined,
          customerId,
          isDefault: true,
          lastUsedAt: new Date(),
        });

      case 'USE_ONCE':
      default:
        const temp = new CustomerLocation({
          ...locationDraft,
          id: `loc_once_${Date.now()}`,
          customerId,
          isDefault: false,
          lastUsedAt: new Date(),
        });
        return temp;
    }
  }
}
