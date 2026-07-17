import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { cafeId } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('staff/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  getBalance(@Req() req: any, @cafeId() cafeId?: string) {
    // The JWT guard should populate req.user with employeeId or sub
    const staffId = req.user?.employeeId || req.user?.sub;
    return this.walletService.getBalance(staffId, cafeId);
  }

  @Post('settle/stage1')
  settleWalletStage1(@Req() req: any, @cafeId() cafeId?: string) {
    const staffId = req.user?.employeeId || req.user?.sub;
    return this.walletService.settleWalletStage1(staffId, cafeId);
  }

  @Post('settle/stage2')
  settleWalletStage2(@Req() req: any, @cafeId() cafeId?: string) {
    const staffId = req.user?.employeeId || req.user?.sub;
    return this.walletService.settleWalletStage2(staffId, cafeId);
  }
}
