import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CrashRecoveryService } from './crash-recovery.service';

@Module({
  imports: [PrismaModule],
  providers: [CrashRecoveryService],
  exports: [CrashRecoveryService],
})
export class CrashRecoveryModule implements OnModuleInit {
  constructor(private readonly crashRecoveryService: CrashRecoveryService) {}

  async onModuleInit() {
    await this.crashRecoveryService.recoverOnStartup();
  }
}
