import { OrderStatus } from '../dto/update-order-status.dto';

export class OrderError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'OrderError';
  }
}

export class OrderNotFoundError extends OrderError {
  constructor(orderId: string) {
    super(`Order with ID ${orderId} not found`, 'ORDER_NOT_FOUND');
  }
}

export class InvalidOrderTransitionError extends OrderError {
  constructor(
    orderId: string,
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Invalid order status transition from ${from} to ${to}`, 'INVALID_ORDER_STATUS_TRANSITION');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class OrderRoleNotAllowedError extends OrderError {
  constructor(
    orderId: string,
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
    public readonly role: string,
  ) {
    super(`Role ${role} not allowed to transition from ${from} to ${to}`, 'ORDER_ROLE_NOT_ALLOWED');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class OrderTenantMismatchError extends OrderError {
  constructor(
    orderId: string,
    public readonly dimension: 'cafe' | 'branch',
  ) {
    super(`Order ${orderId} does not belong to the requested ${dimension}`, 'ORDER_TENANT_MISMATCH');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class OptimisticConcurrencyError extends OrderError {
  constructor(orderId: string) {
    super(`Order ${orderId} was modified concurrently`, 'ORDER_OPTIMISTIC_CONCURRENCY');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}
