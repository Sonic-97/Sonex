import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, ParseUUIDPipe, Req } from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { cafeId, Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('staff')
@UseGuards(RolesGuard)
@Roles('OWNER')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @Roles('OWNER', 'BARISTA', 'DRIVER')
  findAll(@cafeId() cafeId?: string) {
    return this.staffService.findAll(cafeId);
  }

  @Get('attendance/all')
  getAllAttendance(@cafeId() cafeId?: string) {
    return this.staffService.getAllAttendance(cafeId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.staffService.findOne(id, cafeId);
  }

  @Post()
  create(@Body() dto: CreateStaffDto, @cafeId() cafeId?: string, @Req() req?: any) {
    const actorId = req?.user?.id || req?.user?.sub;
    return this.staffService.create(dto, cafeId, actorId);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto, @cafeId() cafeId?: string, @Req() req?: any) {
    const actorId = req?.user?.id || req?.user?.sub;
    return this.staffService.update(id, dto, cafeId, actorId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string, @Req() req?: any) {
    const actorId = req?.user?.id || req?.user?.sub;
    return this.staffService.remove(id, cafeId, actorId);
  }

  @Post(':id/reset-code')
  resetCode(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.staffService.resetCode(id, cafeId);
  }

  @Post(':id/set-password')
  setPassword(@Param('id', ParseUUIDPipe) id: string, @Body('password') password: string, @cafeId() cafeId?: string, @Req() req?: any) {
    const actorId = req?.user?.id || req?.user?.sub;
    return this.staffService.setPassword(id, password, cafeId, actorId);
  }

  @Get(':id/stats')
  getStats(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.staffService.getStats(id, cafeId);
  }

  @Get(':id/attendance-status')
  getAttendanceStatus(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.staffService.getAttendanceStatus(id, cafeId);
  }

  @Post(':id/clock-in')
  clockIn(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.staffService.clockIn(id, cafeId);
  }

  @Post(':id/clock-out')
  clockOut(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.staffService.clockOut(id, cafeId);
  }
}
