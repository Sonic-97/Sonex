export interface RunningAccountProps {
  id: string;
  customerId: string;
  branchId: string;
  creditLimit: number;
  currentBalance: number;
  maxPaymentDays: number;
  isBlocked: boolean;
  lastPaymentAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class RunningAccount {
  constructor(private readonly props: RunningAccountProps) {}

  public get id(): string {
    return this.props.id;
  }

  public get customerId(): string {
    return this.props.customerId;
  }

  public get branchId(): string {
    return this.props.branchId;
  }

  public get creditLimit(): number {
    return this.props.creditLimit;
  }

  public get currentBalance(): number {
    return this.props.currentBalance;
  }

  public get maxPaymentDays(): number {
    return this.props.maxPaymentDays;
  }

  public get isBlocked(): boolean {
    return this.props.isBlocked;
  }

  public get lastPaymentAt(): Date | null | undefined {
    return this.props.lastPaymentAt;
  }

  public canAccrueCredit(amount: number): { allowed: boolean; reason?: string } {
    if (this.props.isBlocked) {
      return { allowed: false, reason: 'Running account is currently blocked by administration.' };
    }

    const newBalance = this.props.currentBalance + amount;
    if (newBalance > this.props.creditLimit) {
      return {
        allowed: false,
        reason: `Order amount would exceed customer credit limit of ${this.props.creditLimit}. Current balance: ${this.props.currentBalance}, Order amount: ${amount}`,
      };
    }

    return { allowed: true };
  }

  public chargeCredit(amount: number): void {
    const check = this.canAccrueCredit(amount);
    if (!check.allowed) {
      throw new Error(check.reason);
    }
    this.props.currentBalance += amount;
  }

  public recordPayment(amount: number): void {
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }
    this.props.currentBalance = Math.max(0, this.props.currentBalance - amount);
    this.props.lastPaymentAt = new Date();
  }

  public toJSON(): RunningAccountProps {
    return { ...this.props };
  }
}
