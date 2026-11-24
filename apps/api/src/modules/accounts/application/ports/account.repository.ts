import { Account } from '../../domain/entities/account.entity';
import { Money } from '../../../common/domain/value-objects/money.vo';
import type { CursorPage } from '@nyx/contracts';
import type { CursorPagination } from '../../../common/application/cursor-pagination';

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

export interface IAccountRepository {
  findById(id: string): Promise<Account | null>;
  findByAccountNumber(accountNumber: string): Promise<Account | null>;
  findByCustomerId(customerId: string, pagination: CursorPagination): Promise<CursorPage<Account>>;
  findAll(pagination: CursorPagination): Promise<CursorPage<Account>>;
  save(account: Account): Promise<Account>;
  updateBalance(id: string, balance: Money, version: number): Promise<boolean>;
}
