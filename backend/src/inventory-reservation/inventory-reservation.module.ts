import { Module } from '@nestjs/common';
import { StockReservationMapper } from './infrastructure/stock-reservation.mapper';
import { StockReservationPrismaStore } from './infrastructure/stock-reservation.prisma-store';
import { StockReservationRepositoryImpl } from './infrastructure/stock-reservation.repository.impl';
import { StockReservationApplicationService } from './application/stock-reservation.application';

export const STOCK_RESERVATION_STORE = 'STOCK_RESERVATION_STORE';
export const STOCK_RESERVATION_REPOSITORY = 'STOCK_RESERVATION_REPOSITORY';

@Module({
  providers: [
    StockReservationMapper,
    { provide: STOCK_RESERVATION_STORE, useClass: StockReservationPrismaStore },
    {
      provide: STOCK_RESERVATION_REPOSITORY,
      useFactory: (store: StockReservationPrismaStore, mapper: StockReservationMapper) =>
        new StockReservationRepositoryImpl(store, mapper),
      inject: [STOCK_RESERVATION_STORE, StockReservationMapper],
    },
    {
      provide: StockReservationApplicationService,
      useFactory: (repository: StockReservationRepositoryImpl) =>
        new StockReservationApplicationService(repository),
      inject: [STOCK_RESERVATION_REPOSITORY],
    },
  ],
  exports: [StockReservationApplicationService],
})
export class InventoryReservationModule {}
