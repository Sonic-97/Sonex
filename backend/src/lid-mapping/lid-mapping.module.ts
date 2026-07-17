import { Module, Global } from '@nestjs/common';
import { LidMappingService } from './lid-mapping.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [LidMappingService],
  exports: [LidMappingService],
})
export class LidMappingModule {}
