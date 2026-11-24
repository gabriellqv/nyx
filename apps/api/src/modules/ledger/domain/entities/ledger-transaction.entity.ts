import { LedgerEntry } from './ledger-entry.entity';

export type LedgerReferenceType = 'transfer' | 'deposit' | 'payment' | 'reversal' | 'adjustment';

/**
 * Immutable entity representing a ledger transaction that encapsulates balanced entries.
 */
export class LedgerTransaction {
  readonly id: string;
  readonly description: string;
  readonly referenceType: LedgerReferenceType;
  readonly referenceId: string | null;
  readonly createdAt: Date;
  readonly entries: readonly LedgerEntry[];

  constructor(params: {
    id: string;
    description: string;
    referenceType: LedgerReferenceType;
    referenceId?: string | null | undefined;
    createdAt?: Date | undefined;
    entries: LedgerEntry[];
  }) {
    this.id = params.id;
    this.description = params.description;
    this.referenceType = params.referenceType;
    this.referenceId = params.referenceId ?? null;
    this.createdAt = params.createdAt ?? new Date();
    this.entries = Object.freeze([...params.entries]);
  }
}
