import { Money } from '../../../common/domain/value-objects/money.vo';

export type LedgerEntryType = 'debit' | 'credit';

/**
 * Immutable entity representing a single debit or credit entry in the general ledger.
 */
export class LedgerEntry {
  readonly id: string;
  readonly transactionId: string;
  readonly accountId: string | null;
  readonly ledgerAccountId: string | null;
  readonly entryType: LedgerEntryType;
  readonly amount: Money;
  readonly sequenceNumber: number;
  readonly createdAt: Date;

  constructor(params: {
    id: string;
    transactionId: string;
    accountId?: string | null;
    ledgerAccountId?: string | null;
    entryType: LedgerEntryType;
    amount: Money;
    sequenceNumber: number;
    createdAt?: Date | undefined;
  }) {
    this.id = params.id;
    this.transactionId = params.transactionId;
    this.accountId = params.accountId ?? null;
    this.ledgerAccountId = params.ledgerAccountId ?? null;
    this.entryType = params.entryType;
    this.amount = params.amount;
    this.sequenceNumber = params.sequenceNumber;
    this.createdAt = params.createdAt ?? new Date();
  }
}
