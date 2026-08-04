export class InCafeOrderError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'InCafeOrderError';
  }
}

export class InCafeOrderNotFoundError extends InCafeOrderError {
  constructor(orderId: string) {
    super(`InCafeOrder with ID ${orderId} not found`, 'IN_CAFE_ORDER_NOT_FOUND');
  }
}

export class InvalidInCafeOrderTransitionError extends InCafeOrderError {
  constructor(
    orderId: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid in-cafe order status transition from ${from} to ${to}`, 'INVALID_IN_CAFE_ORDER_STATUS_TRANSITION');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class InCafeOrderRoleNotAllowedError extends InCafeOrderError {
  constructor(
    orderId: string,
    public readonly from: string,
    public readonly to: string,
    public readonly role: string,
  ) {
    super(`Role ${role} not allowed to transition from ${from} to ${to}`, 'IN_CAFE_ORDER_ROLE_NOT_ALLOWED');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class InCafeOrderTenantMismatchError extends InCafeOrderError {
  constructor(
    orderId: string,
    public readonly dimension: 'cafe' | 'branch',
  ) {
    super(`InCafeOrder ${orderId} does not belong to the requested ${dimension}`, 'IN_CAFE_ORDER_TENANT_MISMATCH');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class InCafeOrderConcurrencyError extends InCafeOrderError {
  constructor(orderId: string) {
    super(`InCafeOrder ${orderId} was modified concurrently`, 'IN_CAFE_ORDER_OPTIMISTIC_CONCURRENCY');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class InCafeOrderAlreadyOnHoldError extends InCafeOrderError {
  constructor() {
    super('Order is already on hold', 'IN_CAFE_ORDER_ALREADY_ON_HOLD');
  }
}

export class InCafeOrderNotOnHoldError extends InCafeOrderError {
  constructor() {
    super('Order is not on hold', 'IN_CAFE_ORDER_NOT_ON_HOLD');
  }
}

export class InCafeOrderCannotCancelError extends InCafeOrderError {
  constructor(orderId: string, public readonly reason: string) {
    super(reason, 'IN_CAFE_ORDER_CANNOT_CANCEL');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class InCafeOrderCannotVoidError extends InCafeOrderError {
  constructor(orderId: string, public readonly reason: string) {
    super(reason, 'IN_CAFE_ORDER_CANNOT_VOID');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class InCafeOrderCannotEditError extends InCafeOrderError {
  constructor(orderId: string, public readonly reason: string) {
    super(reason, 'IN_CAFE_ORDER_CANNOT_EDIT');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class InCafeOrderCannotHoldError extends InCafeOrderError {
  constructor(orderId: string, public readonly reason: string) {
    super(reason, 'IN_CAFE_ORDER_CANNOT_HOLD');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}

export class InCafeOrderCannotPayError extends InCafeOrderError {
  constructor(orderId: string, public readonly reason: string) {
    super(reason, 'IN_CAFE_ORDER_CANNOT_PAY');
    this.orderId = orderId;
  }

  public readonly orderId: string;
}
