import { Controller, Get, Post, Body } from '@nestjs/common';
import { StaffPurchaseService } from './staff-purchase.service';
import { CreateStaffPurchaseDto } from './dto/create-staff-purchase.dto';
import { cafeId } from '../auth/decorators';

@Controller('staff-purchases')
export class StaffPurchaseController {
  constructor(private readonly staffPurchaseService: StaffPurchaseService) {}

  @Post()
  async create(@Body() dto: CreateStaffPurchaseDto, @cafeId() cafeId?: string) {
    return this.staffPurchaseService.create(dto, cafeId);
  }

  @Get()
  async findAll(@cafeId() cafeId?: string) {
    return this.staffPurchaseService.findAll(cafeId);
  }
}




