import { randomUUID } from 'node:crypto';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { UnbalancedLedgerException } from '../../../common/domain/exceptions/domain.exception';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { LedgerTransaction, LedgerReferenceType } from '../entities/ledger-transaction.entity';

/**
 * Domain service enforcing double-entry bookkeeping rules.
 * Guarantees that every posted transaction has balanced debits and credits.
 */
export class DoubleEntryLedgerService {
  /**
   * Validates that sum(debit) === sum(credit) and returns an immutable LedgerTransaction.
   */
  createTransaction(params: {
    description: string;
    referenceType: LedgerReferenceType;
    referenceId?: string | null;
    entries: Array<{
      accountId: string;
      entryType: 'debit' | 'credit';
      amount: Money;
    }>;
  }): LedgerTransaction {
    if (params.entries.length < 2) {
      throw new UnbalancedLedgerException(
        'A double-entry transaction must contain at least two postings',
      );
    }

    const transactionId = randomUUID();
    let totalDebit = 0n;
    let totalCredit = 0n;
    const currency = params.entries[0]?.amount.currency;

    const ledgerEntries: LedgerEntry[] = [];

    params.entries.forEach((entry, index) => {
      if (entry.amount.currency !== currency) {
        throw new UnbalancedLedgerException(
          `All entries in a single ledger transaction must share the same currency (${currency})`,
        );
      }

      if (!entry.amount.isPositive()) {
        throw new UnbalancedLedgerException('Ledger entry amount must be strictly positive');
      }

      if (entry.entryType === 'debit') {
        totalDebit += entry.amount.amount;
      } else {
        totalCredit += entry.amount.amount;
      }

      ledgerEntries.push(
        new LedgerEntry({
          id: randomUUID(),
          transactionId,
          accountId: entry.accountId,
          entryType: entry.entryType,
          amount: entry.amount,
          sequenceNumber: index + 1,
        }),
      );
    });

    if (totalDebit !== totalCredit) {
      throw new UnbalancedLedgerException(
        `Debits (${totalDebit}) and credits (${totalCredit}) do not balance in transaction "${params.description}"`,
      );
    }

    return new LedgerTransaction({
      id: transactionId,
      description: params.description,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      entries: ledgerEntries,
    });
  }

  /**
   * Generates a balanced transfer transaction.
   * In standard bank deposit accounting:
   * - Debiting the source account decreases its balance (liability to the customer reduces).
   * - Crediting the destination account increases its balance (liability to the customer increases).
   */
  createTransferTransaction(params: {
    transferId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: Money;
    description?: string;
  }): LedgerTransaction {
    return this.createTransaction({
      description: params.description ?? `Transfer ${params.transferId}`,
      referenceType: 'transfer',
      referenceId: params.transferId,
      entries: [
        {
          accountId: params.sourceAccountId,
          entryType: 'debit',
          amount: params.amount,
        },
        {
          accountId: params.destinationAccountId,
          entryType: 'credit',
          amount: params.amount,
        },
      ],
    });
  }

  /**
   * Generates an explicit reversal transaction reversing a previously posted transfer.
   */
  createReversalTransaction(params: {
    originalTransferId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: Money;
    reason: string;
  }): LedgerTransaction {
    return this.createTransaction({
      description: `Reversal of transfer ${params.originalTransferId}: ${params.reason}`,
      referenceType: 'reversal',
      referenceId: params.originalTransferId,
      entries: [
        {
          accountId: params.destinationAccountId,
          entryType: 'debit',
          amount: params.amount,
        },
        {
          accountId: params.sourceAccountId,
          entryType: 'credit',
          amount: params.amount,
        },
      ],
    });
  }
}
