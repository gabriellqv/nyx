import { CurrencyMismatchException, InvalidAmountException } from '../exceptions/domain.exception';

/**
 * Value object representing a monetary amount with an explicit ISO 4217 currency.
 * Guarantees exact integer arithmetic in minor currency units to avoid
 * JavaScript floating-point rounding errors.
 */
export class Money {
  private static readonly maxMinorUnits = 9_223_372_036_854_775_807n;
  private readonly minorUnits: bigint;
  private readonly currencyCode: string;

  private constructor(minorUnits: bigint, currencyCode: string) {
    if (minorUnits > Money.maxMinorUnits) {
      throw new InvalidAmountException('Monetary amount exceeds the supported database range');
    }
    this.minorUnits = minorUnits;
    this.currencyCode = currencyCode.toUpperCase();
  }

  /**
   * Creates a Money instance from ISO currency minor units.
   */
  static fromMinorUnits(minorUnits: number | bigint | string, currencyCode: string): Money {
    let value: bigint;
    if (typeof minorUnits === 'number') {
      if (!Number.isSafeInteger(minorUnits)) {
        throw new InvalidAmountException('Monetary amount must be a safe integer');
      }
      value = BigInt(minorUnits);
    } else if (typeof minorUnits === 'string') {
      if (!/^(0|[1-9]\d{0,18})$/.test(minorUnits)) {
        throw new InvalidAmountException('Monetary amount must be an integer minor-unit string');
      }
      value = BigInt(minorUnits);
    } else {
      value = minorUnits;
    }
    if (value < 0n) {
      throw new InvalidAmountException('Monetary amount in minor units cannot be negative');
    }
    if (value > Money.maxMinorUnits) {
      throw new InvalidAmountException('Monetary amount exceeds the supported database range');
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
    return this.minorUnits;
  }

  get currency(): string {
    return this.currencyCode;
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.minorUnits + other.minorUnits, this.currencyCode);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    if (this.minorUnits < other.minorUnits) {
      throw new InvalidAmountException('Resulting monetary balance cannot be negative');
    }
    return new Money(this.minorUnits - other.minorUnits, this.currencyCode);
  }

  equals(other: Money): boolean {
    return this.currencyCode === other.currencyCode && this.minorUnits === other.minorUnits;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits > other.minorUnits;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.minorUnits >= other.minorUnits;
  }

  isPositive(): boolean {
    return this.minorUnits > 0n;
  }

  isZero(): boolean {
    return this.minorUnits === 0n;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currencyCode !== other.currencyCode) {
      throw new CurrencyMismatchException(
        `Cannot operate on incompatible currencies: ${this.currencyCode} and ${other.currencyCode}`,
      );
    }
  }
}
