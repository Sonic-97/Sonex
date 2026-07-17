import { Controller, Get, Post, Patch, Param, Body, Query, HttpCode, HttpStatus, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto, OrderStatus } from './dto/update-order-status.dto';
import { BranchId, cafeId } from '../auth/decorators';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(@Body() createOrderDto: CreateOrderDto, @BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.ordersService.create(createOrderDto, branchId, cafeId);
  }

  @Get()
  async findAll(
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
    @Query('employeeId') employeeId?: string,
    @Query('customerId') customerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @BranchId() branchId?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.ordersService.findAll({ status, sourceType, employeeId, customerId, dateFrom, dateTo }, branchId, cafeId);
  }

  @Get('employee-kpi')
  async getEmployeeKpi(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @BranchId() branchId?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.ordersService.getEmployeeKpi(cafeId, branchId, dateFrom, dateTo);
  }

  @Get('barista/queue')
  async getBaristaQueue(@BranchId() branchId?: string, @cafeId() cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('No cafe context');
    return this.ordersService.getBaristaQueue(cafeId, branchId);
  }

  @Get('driver/queue')
  async getDriverQueue(@BranchId() branchId?: string, @cafeId() cafeId?: string) {
    if (!cafeId) throw new ForbiddenException('No cafe context');
    return this.ordersService.getDriverQueue(cafeId, branchId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.ordersService.findOne(id, cafeId);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @Body('userId') userId?: string,
    @Body('role') role?: string,
    @BranchId() branchId?: string,
    @cafeId() cafeId?: string,
  ) {
    return this.ordersService.updateStatus(id, updateOrderStatusDto, userId, role, branchId, cafeId);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.ordersService.updateStatus(id, { status: OrderStatus.CONFIRMED });
  }

  @Patch(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body('reason') reason: string, @cafeId() cafeId?: string) {
    return this.ordersService.cancel(id, cafeId, reason);
  }
}




