import { Controller, Get, Post, Patch, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { BranchId, cafeId } from '../auth/decorators';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  findAll(@cafeId() cafeId?: string) {
    return this.driversService.findAll(cafeId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.driversService.findOne(id, cafeId);
  }

  @Post()
  create(@Body() body: { name: string; phone: string; branchId?: string }, @BranchId() branchId?: string, @cafeId() cafeId?: string) {
    return this.driversService.create({ ...body, branchId: body.branchId ?? branchId }, cafeId);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: { name?: string; phone?: string; active?: boolean }, @cafeId() cafeId?: string) {
    return this.driversService.update(id, body, cafeId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.driversService.remove(id, cafeId);
  }

  @Post(':driverId/assign/:orderId')
  assignToOrder(@Param('driverId', ParseUUIDPipe) driverId: string, @Param('orderId', ParseUUIDPipe) orderId: string, @cafeId() cafeId?: string) {
    return this.driversService.assignToOrder(driverId, orderId, cafeId);
  }

  @Post(':driverId/accept-order/:orderId')
  acceptOrder(@Param('driverId', ParseUUIDPipe) driverId: string, @Param('orderId', ParseUUIDPipe) orderId: string, @cafeId() cafeId?: string) {
    return this.driversService.acceptOrder(driverId, orderId, cafeId);
  }

  @Post(':driverId/pickup-order/:orderId')
  pickupOrder(@Param('driverId', ParseUUIDPipe) driverId: string, @Param('orderId', ParseUUIDPipe) orderId: string, @cafeId() cafeId?: string) {
    return this.driversService.pickupOrder(driverId, orderId, cafeId);
  }

  @Post(':driverId/complete/:orderId')
  completeDelivery(@Param('driverId', ParseUUIDPipe) driverId: string, @Param('orderId', ParseUUIDPipe) orderId: string, @cafeId() cafeId?: string) {
    return this.driversService.completeDelivery(driverId, orderId, cafeId);
  }

  @Post(':driverId/collect-payment/:orderId')
  collectPayment(@Param('driverId', ParseUUIDPipe) driverId: string, @Param('orderId', ParseUUIDPipe) orderId: string, @cafeId() cafeId?: string) {
    return this.driversService.collectPayment(driverId, orderId, cafeId);
  }

  @Get(':id/stats')
  getStats(@Param('id', ParseUUIDPipe) id: string, @cafeId() cafeId?: string) {
    return this.driversService.getDriverStats(id, cafeId);
  }

  // Phase 4: Cash settlement
  @Post('settlement')
  submitSettlement(@Body() body: { driverId: string; amount: number; notes?: string }, @cafeId() cafeId?: string, @BranchId() branchId?: string) {
    return this.driversService.submitSettlement(body.driverId, body.amount, body.notes, cafeId, branchId);
  }

  @Get('settlements/pending')
  getPendingSettlements(@cafeId() cafeId?: string) {
    return this.driversService.getPendingSettlements(cafeId);
  }

  @Patch('settlements/:id/approve')
  approveSettlement(@Param('id', ParseUUIDPipe) id: string, @Body('approvedById') approvedById: string, @cafeId() cafeId?: string) {
    return this.driversService.approveSettlement(id, approvedById, cafeId);
  }

  @Patch('settlements/:id/reject')
  rejectSettlement(@Param('id', ParseUUIDPipe) id: string, @Body('reason') reason: string, @cafeId() cafeId?: string) {
    return this.driversService.rejectSettlement(id, reason, cafeId);
  }

  @Post('evaluate-bonuses')
  evaluateBonuses(@cafeId() cafeId?: string) {
    return this.driversService.evaluateBonuses(cafeId);
  }
}
