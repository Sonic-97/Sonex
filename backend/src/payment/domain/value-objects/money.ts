export interface MoneyData {
  currency: string;
  amount: number;
}

export class Money {
  private constructor(
    public readonly currency: string,
    public readonly amount: number,
  ) {}

  static from(currency: string, amount: number): Money {
    if (amount < 0) throw new Error('Money amount cannot be negative');
    if (!currency || currency.trim().length === 0) throw new Error('Currency is required');
    return new Money(currency.toUpperCase().trim(), Math.round(amount * 100) / 100);
  }

  static zero(currency: string = 'EGP'): Money {
    return Money.from(currency, 0);
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
    return Money.from(this.currency, this.amount + other.amount);
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
    return Money.from(this.currency, this.amount - other.amount);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  toSnapshot(): MoneyData {
    return { currency: this.currency, amount: this.amount };
  }

  static fromSnapshot(data: MoneyData): Money {
    return Money.from(data.currency, data.amount);
  }
}
