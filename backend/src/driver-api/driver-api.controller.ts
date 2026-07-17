import { Controller, Post, Get, Put, Body, Param, UseGuards, HttpCode, HttpStatus, Req, UnauthorizedException } from '@nestjs/common';
import { DriverApiService } from './driver-api.service';
import { DriverApiAuthGuard } from './driver-api-auth.guard';
import { DriverLoginRequest, DriverLocationUpdate, DriverStatusUpdate, AuthPayload } from './driver-api.types';

@Controller('driver')
export class DriverApiController {
  constructor(private readonly api: DriverApiService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: DriverLoginRequest) {
    return this.api.login(body);
  }

  @Get('profile')
  @UseGuards(DriverApiAuthGuard)
  async getProfile(@Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.getProfile(payload.driverId);
  }

  @Get('assignments')
  @UseGuards(DriverApiAuthGuard)
  async getAssignments(@Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.getAssignments(payload.driverId);
  }

  @Get('assignments/:id')
  @UseGuards(DriverApiAuthGuard)
  async getAssignment(@Param('id') id: string, @Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.getAssignment(payload.driverId, id);
  }

  @Post('assignments/:id/accept')
  @UseGuards(DriverApiAuthGuard)
  async acceptAssignment(@Param('id') id: string, @Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.acceptAssignment(payload.driverId, id);
  }

  @Post('assignments/:id/reject')
  @UseGuards(DriverApiAuthGuard)
  async rejectAssignment(@Param('id') id: string, @Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.rejectAssignment(payload.driverId, id);
  }

  @Post('assignments/:id/picked-up')
  @UseGuards(DriverApiAuthGuard)
  async completePickup(@Param('id') id: string, @Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.completePickup(payload.driverId, id);
  }

  @Post('assignments/:id/delivered')
  @UseGuards(DriverApiAuthGuard)
  async completeDelivery(@Param('id') id: string, @Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.completeDelivery(payload.driverId, id);
  }

  @Put('location')
  @UseGuards(DriverApiAuthGuard)
  async updateLocation(@Body() body: DriverLocationUpdate, @Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.updateLocation(payload.driverId, body);
  }

  @Put('status')
  @UseGuards(DriverApiAuthGuard)
  async updateStatus(@Body() body: DriverStatusUpdate, @Req() req: any) {
    const payload = req.driverPayload as AuthPayload;
    if (!payload) throw new UnauthorizedException();
    return this.api.updateStatus(payload.driverId, body);
  }
}
