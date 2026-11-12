import { LedgerTransaction } from '../../domain/entities/ledger-transaction.entity';
import { LedgerEntry } from '../../domain/entities/ledger-entry.entity';

export const LEDGER_REPOSITORY = Symbol('LEDGER_REPOSITORY');

export interface ILedgerRepository {
  saveTransaction(transaction: LedgerTransaction): Promise<LedgerTransaction>;
  findTransactionById(id: string): Promise<LedgerTransaction | null>;
  findEntriesByAccountId(accountId: string): Promise<LedgerEntry[]>;
  calculateAccountBalance(accountId: string): Promise<{
    totalDebits: bigint;
    totalCredits: bigint;
    netBalance: bigint;
  }>;
}
