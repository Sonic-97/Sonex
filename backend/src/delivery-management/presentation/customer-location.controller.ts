import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { CustomerLocationService, LocationOverrideDecision } from '../application/services/customer-location.service';

@Controller('api/v1/delivery-management/locations')
export class CustomerLocationController {
  constructor(private readonly locationService: CustomerLocationService) {}

  @Post()
  public async saveLocation(@Body() body: any) {
    return this.locationService.saveCustomerLocation(body);
  }

  @Get('customer/:customerId')
  public async getCustomerLocations(@Param('customerId') customerId: string) {
    return this.locationService.getCustomerLocations(customerId);
  }

  @Get('customer/:customerId/default')
  public async getDefaultLocation(@Param('customerId') customerId: string) {
    const loc = await this.locationService.getDefaultLocation(customerId);
    return { defaultLocation: loc };
  }

  @Patch('customer/:customerId/set-default/:locationId')
  public async setDefaultLocation(
    @Param('customerId') customerId: string,
    @Param('locationId') locationId: string,
  ) {
    await this.locationService.setDefaultLocation(customerId, locationId);
    return { success: true, message: 'Default location updated successfully.' };
  }

  @Delete('customer/:customerId/:locationId')
  public async deleteLocation(
    @Param('customerId') customerId: string,
    @Param('locationId') locationId: string,
  ) {
    await this.locationService.deleteLocation(customerId, locationId);
    return { success: true, message: 'Location deleted successfully.' };
  }

  @Post('handle-incoming-gps')
  public async handleIncomingGps(
    @Body()
    body: {
      customerId: string;
      branchId: string;
      latitude: number;
      longitude: number;
      label?: string;
      buildingNumber?: string;
      floor?: string;
      apartment?: string;
      landmark?: string;
    },
  ) {
    return this.locationService.handleIncomingGpsLocation(
      body.customerId,
      body.branchId,
      body.latitude,
      body.longitude,
      body,
    );
  }

  @Post('apply-override-choice')
  public async applyOverrideChoice(
    @Body()
    body: {
      customerId: string;
      locationDraft: any;
      decision: LocationOverrideDecision;
    },
  ) {
    return this.locationService.applyLocationOverrideChoice(body.customerId, body.locationDraft, body.decision);
  }
}
