import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaRecipeBOMRepository } from './infrastructure/repositories/prisma-recipe-bom.repository';
import { RecipeBOMService } from './application/recipe-bom.service';
import { RecipeBOMController } from './presentation/recipe-bom.controller';

@Module({
  imports: [PrismaModule],
  controllers: [RecipeBOMController],
  providers: [
    RecipeBOMService,
    {
      provide: 'IRecipeBOMRepository',
      useClass: PrismaRecipeBOMRepository,
    },
  ],
  exports: [RecipeBOMService],
})
export class RecipeBOMModule {}
