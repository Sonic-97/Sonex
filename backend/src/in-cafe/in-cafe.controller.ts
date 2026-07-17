import { Controller, Get, Post, Patch, Put, Param, Body, Query, HttpCode, HttpStatus, Req, ParseUUIDPipe } from '@nestjs/common';
import { InCafeService } from './in-cafe.service';
import { CreateInCafeOrderDto } from './dto/create-in-cafe-order.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { EditInCafeOrderDto } from './dto/edit-in-cafe-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { HoldOrderDto } from './dto/hold-order.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { AssignCustomerDto } from './dto/assign-customer.dto';
import { cafeId } from '../auth/decorators';

@Controller('in-cafe')
export class InCafeController {
  constructor(private readonly inCafeService: InCafeService) {}

  @Post('orders')
  async createOrder(@Body() dto: CreateInCafeOrderDto, @cafeId() cafeId?: string) {
    return this.inCafeService.createOrder(dto, cafeId);
  }

  @Get('orders')
  async findAll(@Query('status') status?: string, @cafeId() cafeId?: string) {
    return this.inCafeService.findAll(status, cafeId);
  }

  @Get('orders/:id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.inCafeService.findOne(id, cafeId);
  }

  @Get('kitchen/orders')
  async getKitchenOrders(@cafeId() cafeId?: string) {
    return this.inCafeService.getKitchenOrders(cafeId);
  }

  @Get('orders/:id/history')
  async getOrderHistory(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.inCafeService.getOrderHistory(id, cafeId);
  }

  @Get('orders/:id/receipt')
  async reprintReceipt(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.inCafeService.reprintReceipt(id, cafeId);
  }

  @Get('debts/customer-summary')
  async getCustomerDebtSummary(@cafeId() cafeId?: string) {
    return this.inCafeService.getCustomerDebtSummary(cafeId);
  }

  @Put('orders/:id/edit')
  @HttpCode(HttpStatus.OK)
  async editOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditInCafeOrderDto,
    @Req() req: any,
    @cafeId() cafeId?: string,
  ) {
    const staffId = req.user?.employeeId || req.user?.sub;
    return this.inCafeService.editOrder(id, dto, staffId, cafeId);
  }

  @Patch('orders/:id/status')
  @HttpCode(HttpStatus.OK)
  async updateOrderStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto, @cafeId() cafeId?: string) {
    return this.inCafeService.updateOrderStatus(id, dto, cafeId);
  }

  @Patch('orders/:id/payment')
  @HttpCode(HttpStatus.OK)
  async updatePayment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePaymentDto, @Req() req: any, @cafeId() cafeId?: string) {
    const staffId = req.user?.employeeId || req.user?.sub;
    return this.inCafeService.updatePayment(id, dto, staffId, cafeId);
  }

  @Patch('orders/:id/void')
  @HttpCode(HttpStatus.OK)
  async voidOrder(@Param('id', ParseUUIDPipe) id: string, @Body('reason') reason: string, @Req() req: any, @cafeId() cafeId?: string) {
    const staffId = req.user?.employeeId || req.user?.sub;
    return this.inCafeService.voidOrder(id, reason, staffId, cafeId);
  }

  @Patch('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto, @Req() req: any, @cafeId() cafeId?: string) {
    const staffId = req.user?.employeeId || req.user?.sub;
    return this.inCafeService.cancelOrder(id, dto, staffId, cafeId);
  }

  @Patch('orders/:id/hold')
  @HttpCode(HttpStatus.OK)
  async holdOrder(@Param('id', ParseUUIDPipe) id: string, @Body() dto: HoldOrderDto, @cafeId() cafeId?: string) {
    return this.inCafeService.holdOrder(id, dto, cafeId);
  }

  @Patch('orders/:id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeHeldOrder(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.inCafeService.resumeHeldOrder(id, cafeId);
  }

  @Patch('orders/:id/notes')
  @HttpCode(HttpStatus.OK)
  async updateOrderNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderNoteDto, @cafeId() cafeId?: string) {
    return this.inCafeService.updateOrderNote(id, dto, cafeId);
  }

  @Patch('orders/:id/assign-customer')
  @HttpCode(HttpStatus.OK)
  async assignCustomer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignCustomerDto, @cafeId() cafeId?: string) {
    return this.inCafeService.assignCustomer(id, dto, cafeId);
  }
}




