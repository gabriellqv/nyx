import { Money } from '../../../common/domain/value-objects/money.vo';
import {
  AccountInactiveException,
  InsufficientFundsException,
} from '../../../common/domain/exceptions/domain.exception';

export type AccountType = 'checking' | 'savings' | 'internal';
export type AccountStatus = 'active' | 'frozen' | 'closed';

/**
 * Domain entity representing a customer or internal financial account.
 */
export class Account {
  readonly id: string;
  readonly customerId: string;
  readonly accountNumber: string;
  readonly currency: string;
  readonly type: AccountType;
  private currentStatus: AccountStatus;
  private currentBalance: Money;
  private currentVersion: number;
  readonly createdAt: Date;
  private lastUpdatedAt: Date;

  constructor(params: {
    id: string;
    customerId: string;
    accountNumber: string;
    currency: string;
    type?: AccountType | undefined;
    status?: AccountStatus | undefined;
    balance?: Money | undefined;
    version?: number | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
  }) {
    this.id = params.id;
    this.customerId = params.customerId;
    this.accountNumber = params.accountNumber;
    this.currency = params.currency.toUpperCase();
    this.type = params.type ?? 'checking';
    this.currentStatus = params.status ?? 'active';
    this.currentBalance = params.balance ?? Money.zero(this.currency);
    this.currentVersion = params.version ?? 0;
    this.createdAt = params.createdAt ?? new Date();
    this.lastUpdatedAt = params.updatedAt ?? new Date();
  }

  get status(): AccountStatus {
    return this.currentStatus;
  }

  get balance(): Money {
    return this.currentBalance;
  }

  get version(): number {
    return this.currentVersion;
  }

  get updatedAt(): Date {
    return this.lastUpdatedAt;
  }

  isActive(): boolean {
    return this.currentStatus === 'active';
  }

  /**
   * Applies a debit operation, reducing the account balance.
   */
  debit(amount: Money): void {
    this.assertIsActive();
    if (this.currentBalance.amount < amount.amount) {
      throw new InsufficientFundsException(
        `Insufficient funds in account ${this.accountNumber}. Available: ${this.currentBalance.amountNumber}, Requested: ${amount.amountNumber}`,
      );
    }

    this.currentBalance = this.currentBalance.subtract(amount);
    this.currentVersion += 1;
    this.lastUpdatedAt = new Date();
  }

  /**
   * Applies a credit operation, increasing the account balance.
   */
  credit(amount: Money): void {
    this.assertIsActive();
    this.currentBalance = this.currentBalance.add(amount);
    this.currentVersion += 1;
    this.lastUpdatedAt = new Date();
  }

  freeze(): void {
    this.currentStatus = 'frozen';
    this.lastUpdatedAt = new Date();
  }

  close(): void {
    if (!this.currentBalance.isZero()) {
      throw new InsufficientFundsException('Cannot close account with non-zero balance');
    }
    this.currentStatus = 'closed';
    this.lastUpdatedAt = new Date();
  }

  private assertIsActive(): void {
    if (!this.isActive()) {
      throw new AccountInactiveException(
        `Account ${this.accountNumber} is ${this.currentStatus} and cannot process transactions`,
      );
    }
  }
}
