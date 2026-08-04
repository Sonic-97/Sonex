export enum PaymentStatus {
  PENDING = 'PENDING',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export class PaymentStatusValue {
  private constructor(public readonly value: PaymentStatus) {}

  static from(value: string): PaymentStatusValue {
    const upper = value.toUpperCase();
    if (!Object.values(PaymentStatus).includes(upper as PaymentStatus)) {
      throw new Error(`Invalid payment status: ${value}`);
    }
    return new PaymentStatusValue(upper as PaymentStatus);
  }

  isTerminal(): boolean {
    return this.value === PaymentStatus.CAPTURED
      || this.value === PaymentStatus.FAILED
      || this.value === PaymentStatus.REFUNDED;
  }

  canTransitionTo(target: PaymentStatusValue): boolean {
    const transitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.PENDING]: [PaymentStatus.AUTHORIZED, PaymentStatus.FAILED],
      [PaymentStatus.AUTHORIZED]: [PaymentStatus.CAPTURED, PaymentStatus.FAILED, PaymentStatus.REFUNDED],
      [PaymentStatus.CAPTURED]: [PaymentStatus.REFUNDED],
      [PaymentStatus.FAILED]: [],
      [PaymentStatus.REFUNDED]: [],
    };
    return transitions[this.value].includes(target.value);
  }

  toSnapshot(): string {
    return this.value;
  }

  static fromSnapshot(value: string): PaymentStatusValue {
    return PaymentStatusValue.from(value);
  }
}
