import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerMemoryModule } from '../customer-memory/customer-memory.module';
import { PersonalizationProfileService } from './personalization-profile.service';

@Module({
  imports: [PrismaModule, CustomerMemoryModule],
  providers: [PersonalizationProfileService],
  exports: [PersonalizationProfileService],
})
export class PersonalizationModule {}
