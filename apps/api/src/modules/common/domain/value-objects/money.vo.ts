import { CurrencyMismatchException, InvalidAmountException } from '../exceptions/domain.exception';

/**
 * Value object representing a monetary amount with an explicit ISO 4217 currency.
 * Guarantees exact integer arithmetic in minor currency units (cents) to avoid
 * JavaScript floating-point rounding errors.
 */
export class Money {
  private readonly cents: bigint;
  private readonly currencyCode: string;

  private constructor(cents: bigint, currencyCode: string) {
    this.cents = cents;
    this.currencyCode = currencyCode.toUpperCase();
  }

  /**
   * Creates a Money instance from minor units (e.g., cents, centavos).
   */
  static fromCents(cents: number | bigint, currencyCode: string): Money {
    const value = typeof cents === 'number' ? BigInt(cents) : cents;
    if (value < 0n) {
      throw new InvalidAmountException('Monetary amount in minor units cannot be negative');
    }
    return new Money(value, currencyCode);
  }

  /**
   * Creates a zero-value Money instance for a specific currency.
   */
  static zero(currencyCode: string): Money {
    return new Money(0n, currencyCode);
  }

  get amount(): bigint {
    return this.cents;
  }

  get amountNumber(): number {
    return Number(this.cents);
  }

  get currency(): string {
    return this.currencyCode;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.cents + other.cents, this.currencyCode);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    if (this.cents < other.cents) {
      throw new InvalidAmountException('Resulting monetary balance cannot be negative');
    }
    return new Money(this.cents - other.cents, this.currencyCode);
  }

  equals(other: Money): boolean {
    return this.currencyCode === other.currencyCode && this.cents === other.cents;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.cents > other.cents;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.cents >= other.cents;
  }

  isPositive(): boolean {
    return this.cents > 0n;
  }

  isZero(): boolean {
    return this.cents === 0n;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currencyCode !== other.currencyCode) {
      throw new CurrencyMismatchException(
        `Cannot operate on incompatible currencies: ${this.currencyCode} and ${other.currencyCode}`,
      );
    }
  }
}
