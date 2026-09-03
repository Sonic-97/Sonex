import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaRunningAccountRepository } from './infrastructure/repositories/prisma-running-account.repository';
import { RunningAccountService } from './application/running-account.service';
import { RunningAccountController } from './presentation/running-account.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RunningAccountController],
  providers: [
    RunningAccountService,
    {
      provide: 'IRunningAccountRepository',
      useClass: PrismaRunningAccountRepository,
    },
  ],
  exports: [RunningAccountService],
})
export class RunningAccountModule {}
