import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { DeliveryZoneManagementService, CreateDeliveryZoneInput } from '../application/services/delivery-zone-management.service';

@Controller('api/v1/delivery-management/zones')
export class DeliveryZoneController {
  constructor(private readonly zoneManagement: DeliveryZoneManagementService) {}

  @Post()
  public async createZone(@Body() input: CreateDeliveryZoneInput) {
    return this.zoneManagement.createZone(input);
  }

  @Get('branch/:branchId')
  public async getZonesByBranch(@Param('branchId') branchId: string) {
    return this.zoneManagement.getZonesByBranch(branchId);
  }

  @Get('cafe/:cafeId')
  public async getZonesByCafe(@Param('cafeId') cafeId: string) {
    return this.zoneManagement.getZonesByCafe(cafeId);
  }

  @Get(':id')
  public async getZoneById(@Param('id') id: string) {
    return this.zoneManagement.getZoneById(id);
  }

  @Put(':id')
  public async updateZone(@Param('id') id: string, @Body() updates: any) {
    return this.zoneManagement.updateZone(id, updates);
  }

  @Delete(':id')
  public async deleteZone(@Param('id') id: string) {
    await this.zoneManagement.deleteZone(id);
    return { success: true, message: 'Delivery zone deleted successfully.' };
  }

  @Post(':id/streets')
  public async addStreet(
    @Param('id') id: string,
    @Body() body: { streetName: string; displayOrder?: number },
  ) {
    await this.zoneManagement.addStreetToZone(id, body.streetName, body.displayOrder ?? 0);
    return { success: true, message: 'Street added to zone.' };
  }

  @Delete('streets/:streetId')
  public async removeStreet(@Param('streetId') streetId: string) {
    await this.zoneManagement.removeStreetFromZone(streetId);
    return { success: true, message: 'Street removed from zone.' };
  }
}
