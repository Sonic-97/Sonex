export class StockReservationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'StockReservationError';
  }
}

export class StockReservationNotFoundError extends StockReservationError {
  constructor(id: string) {
    super(`Stock reservation not found: ${id}`, 'STOCK_RESERVATION_NOT_FOUND');
  }
}

export class InvalidStockReservationTransitionError extends StockReservationError {
  constructor(id: string, status: string, action: string) {
    super(`Cannot ${action} stock reservation ${id} in status ${status}`, 'INVALID_STOCK_RESERVATION_TRANSITION');
  }
}

export class OptimisticConcurrencyError extends StockReservationError {
  constructor(id: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic concurrency conflict for StockReservation ${id}: expected version ${expectedVersion}, actual version ${actualVersion}`,
      'OPTIMISTIC_CONCURRENCY_CONFLICT',
    );
  }
}
