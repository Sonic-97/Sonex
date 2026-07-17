import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('super-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('cafes')
  async getCafes() {
    return this.superAdminService.getAllCafes();
  }

  @Post('cafes')
  async createCafe(@Body() dto: { name: string; ownerCode: string; ownerPassword: string; phone: string }) {
    return this.superAdminService.createCafe(dto);
  }

  @Patch('cafes/:id')
  async updateCafe(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.superAdminService.updateCafe(id, dto);
  }

  @Delete('cafes/:id')
  async deleteCafe(@Param('id', ParseUUIDPipe) id: string) {
    return this.superAdminService.deleteCafe(id);
  }
}
