import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaDeliveryZoneRepository } from './infrastructure/repositories/prisma-delivery-zone.repository';
import { PrismaCustomerLocationRepository } from './infrastructure/repositories/prisma-customer-location.repository';
import { GeoLocationService } from './application/services/geo-location.service';
import { ZoneResolverService } from './application/services/zone-resolver.service';
import { DeliveryPolicyService } from './application/services/delivery-policy.service';
import { ETAEngineService } from './application/services/eta-engine.service';
import { CustomerLocationService } from './application/services/customer-location.service';
import { DriverAssignmentService } from './application/services/driver-assignment.service';
import { DeliveryZoneManagementService } from './application/services/delivery-zone-management.service';
import { DeliveryAIAnalyticsService } from './application/services/delivery-ai-analytics.service';
import { DeliveryZoneController } from './presentation/delivery-zone.controller';
import { CustomerLocationController } from './presentation/customer-location.controller';
import { DeliveryResolutionController } from './presentation/delivery-resolution.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    DeliveryZoneController,
    CustomerLocationController,
    DeliveryResolutionController,
  ],
  providers: [
    {
      provide: 'IDeliveryZoneRepository',
      useClass: PrismaDeliveryZoneRepository,
    },
    {
      provide: 'ICustomerLocationRepository',
      useClass: PrismaCustomerLocationRepository,
    },
    GeoLocationService,
    ZoneResolverService,
    DeliveryPolicyService,
    ETAEngineService,
    CustomerLocationService,
    DriverAssignmentService,
    DeliveryZoneManagementService,
    DeliveryAIAnalyticsService,
  ],
  exports: [
    'IDeliveryZoneRepository',
    'ICustomerLocationRepository',
    GeoLocationService,
    ZoneResolverService,
    DeliveryPolicyService,
    ETAEngineService,
    CustomerLocationService,
    DriverAssignmentService,
    DeliveryZoneManagementService,
    DeliveryAIAnalyticsService,
  ],
})
export class DeliveryManagementModule {}
