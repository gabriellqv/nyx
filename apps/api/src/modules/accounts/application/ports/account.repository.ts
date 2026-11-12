import { Account } from '../../domain/entities/account.entity';
import { Money } from '../../../common/domain/value-objects/money.vo';

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  findByAccountNumber(accountNumber: string): Promise<Account | null>;
  findByCustomerId(customerId: string): Promise<Account[]>;
  findAll(): Promise<Account[]>;
  save(account: Account): Promise<Account>;
  updateBalance(id: string, balance: Money, version: number): Promise<boolean>;
}
