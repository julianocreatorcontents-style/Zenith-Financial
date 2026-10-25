export class Money {
  private readonly cents: number;

  private constructor(cents: number) {
    if (!Number.isInteger(cents)) {
      throw new Error("Money.cents must be an integer");
    }
    this.cents = cents;
  }

  static fromBRL(value: number): Money {
    return new Money(Math.round(value * 100));
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.cents * factor));
  }

  toBRL(): number {
    return this.cents / 100;
  }

  isGreaterThan(other: Money): boolean {
    return this.cents > other.cents;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }
}
