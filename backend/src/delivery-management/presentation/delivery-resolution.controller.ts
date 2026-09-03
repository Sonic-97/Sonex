import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ZoneResolverService } from '../application/services/zone-resolver.service';
import { DeliveryPolicyService } from '../application/services/delivery-policy.service';
import { ETAEngineService } from '../application/services/eta-engine.service';
import { DriverAssignmentService } from '../application/services/driver-assignment.service';
import { DeliveryAIAnalyticsService } from '../application/services/delivery-ai-analytics.service';
import { CustomerLocationService } from '../application/services/customer-location.service';
import { DeliveryZoneManagementService } from '../application/services/delivery-zone-management.service';

@Controller('api/v1/delivery-management')
export class DeliveryResolutionController {
  constructor(
    private readonly zoneResolver: ZoneResolverService,
    private readonly deliveryPolicy: DeliveryPolicyService,
    private readonly etaEngine: ETAEngineService,
    private readonly driverAssignment: DriverAssignmentService,
    private readonly aiAnalytics: DeliveryAIAnalyticsService,
    private readonly locationService: CustomerLocationService,
    private readonly zoneManagement: DeliveryZoneManagementService,
  ) {}

  @Post('resolve-gps')
  public async resolveGps(
    @Body()
    body: {
      branchId: string;
      latitude: number;
      longitude: number;
      allBranches?: Array<{ id: string; name: string; lat: number; lng: number }>;
    },
  ) {
    return this.zoneResolver.resolveByGpsCoordinates(body.branchId, body.latitude, body.longitude, body.allBranches);
  }

  @Post('resolve-street')
  public async resolveStreet(
    @Body()
    body: {
      branchId: string;
      streetName: string;
    },
  ) {
    return this.zoneResolver.resolveByStreetName(body.branchId, body.streetName);
  }

  @Post('policy/calculate')
  public async calculatePolicy(
    @Body()
    body: {
      zoneId: string;
      orderSubtotal: number;
      freeDeliveryThreshold?: number;
    },
  ) {
    const zone = await this.zoneManagement.getZoneById(body.zoneId);
    return this.deliveryPolicy.calculateDeliveryPolicy(zone, body.orderSubtotal, body.freeDeliveryThreshold);
  }

  @Post('estimate-eta')
  public async estimateEta(
    @Body()
    body: {
      zoneId: string;
      activeOrdersCount?: number;
      availableDriversCount?: number;
    },
  ) {
    const zone = await this.zoneManagement.getZoneById(body.zoneId);
    return this.etaEngine.calculateETA(zone, body.activeOrdersCount ?? 0, body.availableDriversCount ?? 1);
  }

  @Get('driver-payload/:orderId')
  public async getDriverPayload(
    @Param('orderId') orderId: string,
    @Query('locationId') locationId: string,
    @Query('zoneId') zoneId: string,
    @Query('customerName') customerName: string,
    @Query('customerPhone') customerPhone: string,
  ) {
    const loc = await this.locationService.getCustomerLocations(locationId).then((locs) => locs.find((l) => l.id === locationId));
    const zone = await this.zoneManagement.getZoneById(zoneId);
    return this.driverAssignment.generateDriverPayload(
      orderId,
      customerName || 'Customer',
      customerPhone || 'N/A',
      loc!,
      zone,
    );
  }

  @Get('ai-analytics/:branchId')
  public async getAIAnalytics(@Param('branchId') branchId: string) {
    return this.aiAnalytics.analyzeBranchZones(branchId);
  }
}
