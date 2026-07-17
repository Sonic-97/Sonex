import { Module } from '@nestjs/common';
import { RefrigeratorController } from './refrigerator.controller';
import { RefrigeratorService } from './refrigerator.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RefrigeratorController],
  providers: [RefrigeratorService],
  exports: [RefrigeratorService],
})
export class RefrigeratorModule {}
