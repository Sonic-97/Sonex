import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppGateway } from '../websocket/websocket.gateway';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private websocketGateway: AppGateway,
  ) {}

  async getBalance(staffId: string, cafeId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, cafeId }
    });
    if (!staff) throw new BadRequestException('Staff not found');
    
    // Get active shift status if any
    const activeShift = await this.prisma.cashHandover.findFirst({
      where: { staffId, cafeId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    return { 
      balance: Number(staff.currentCashWallet || 0),
      shiftStart: activeShift?.shiftStart || null,
      currentCashWallet: Number(staff.currentCashWallet || 0),
    };
  }

  async settleWalletStage1(staffId: string, cafeId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, cafeId }
    });
    if (!staff) throw new BadRequestException('Staff not found');

    const amount = Number(staff.currentCashWallet);

    const activeShift = await this.prisma.cashHandover.findFirst({
      where: { staffId, cafeId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });

    return await this.prisma.$transaction(async (tx) => {
      let record;
      if (activeShift) {
        record = await tx.cashHandover.update({
          where: { id: activeShift.id },
          data: {
            shiftEnd: new Date(),
            status: 'AWAITING_HANDOFF',
            expectedCash: amount,
            amount: amount,
          }
        });
      } else {
        record = await tx.cashHandover.create({
          data: {
            cafeId,
            staffId,
            shiftStart: new Date(),
            shiftEnd: new Date(),
            status: 'AWAITING_HANDOFF',
            expectedCash: amount,
            amount: amount,
          }
        });
      }

      // Reset the staff's wallet balance for the next shift immediately
      await tx.staff.update({
        where: { id: staffId },
        data: { currentCashWallet: 0 }
      });

      return {
        staffName: staff.name,
        expectedAmount: amount,
        record
      };
    });
  }

  async settleWalletStage2(staffId: string, cafeId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, cafeId }
    });
    if (!staff) throw new BadRequestException('Staff not found');

    const pendingShift = await this.prisma.cashHandover.findFirst({
      where: { staffId, cafeId, status: 'AWAITING_HANDOFF' },
      orderBy: { createdAt: 'desc' }
    });

    if (!pendingShift) {
      throw new BadRequestException('No shift awaiting handoff found.');
    }

    const handover = await this.prisma.cashHandover.update({
      where: { id: pendingShift.id },
      data: {
        status: 'AWAITING_CONFIRMATION',
      }
    });

    // Notify the owner in real-time
    this.websocketGateway.server.to(`owner_${cafeId}`).emit('SHIFT_CASH_DELIVERED', {
      shiftId: handover.id,
      staffName: staff.name,
      expectedCash: Number(handover.expectedCash),
      timestamp: new Date()
    });

    return handover;
  }
}
