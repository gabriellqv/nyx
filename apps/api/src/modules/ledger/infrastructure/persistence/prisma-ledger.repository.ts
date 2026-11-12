import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { LedgerEntry, LedgerEntryType } from '../../domain/entities/ledger-entry.entity';
import {
  LedgerTransaction,
  LedgerReferenceType,
} from '../../domain/entities/ledger-transaction.entity';
import { ILedgerRepository } from '../../application/ports/ledger.repository';

@Injectable()
export class PrismaLedgerRepository implements ILedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async saveTransaction(transaction: LedgerTransaction): Promise<LedgerTransaction> {
    await this.prisma.ledgerTransaction.create({
      data: {
        id: transaction.id,
        description: transaction.description,
        referenceType: transaction.referenceType,
        referenceId: transaction.referenceId,
        createdAt: transaction.createdAt,
        entries: {
          create: transaction.entries.map(e => ({
            id: e.id,
            accountId: e.accountId,
            entryType: e.entryType,
            amount: e.amount.amount,
            currency: e.amount.currency,
            sequenceNumber: e.sequenceNumber,
            createdAt: e.createdAt,
          })),
        },
      },
    });

    return transaction;
  }

  async findTransactionById(id: string): Promise<LedgerTransaction | null> {
    const record = await this.prisma.ledgerTransaction.findUnique({
      where: { id },
      include: { entries: { orderBy: { sequenceNumber: 'asc' } } },
    });

    if (!record) return null;

    return new LedgerTransaction({
      id: record.id,
      description: record.description,
      referenceType: record.referenceType as LedgerReferenceType,
      referenceId: record.referenceId,
      createdAt: record.createdAt,
      entries: record.entries.map(
        e =>
          new LedgerEntry({
            id: e.id,
            transactionId: e.transactionId,
            accountId: e.accountId,
            entryType: e.entryType as LedgerEntryType,
            amount: Money.fromCents(e.amount, e.currency),
            sequenceNumber: e.sequenceNumber,
            createdAt: e.createdAt,
          }),
      ),
    });
  }

  async findEntriesByAccountId(accountId: string): Promise<LedgerEntry[]> {
    const records = await this.prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map(
      e =>
        new LedgerEntry({
          id: e.id,
          transactionId: e.transactionId,
          accountId: e.accountId,
          entryType: e.entryType as LedgerEntryType,
          amount: Money.fromCents(e.amount, e.currency),
          sequenceNumber: e.sequenceNumber,
          createdAt: e.createdAt,
        }),
    );
  }

  async calculateAccountBalance(accountId: string): Promise<{
    totalDebits: bigint;
    totalCredits: bigint;
    netBalance: bigint;
  }> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { accountId },
      select: { entryType: true, amount: true },
    });

    let totalDebits = 0n;
    let totalCredits = 0n;

    for (const entry of entries) {
      if (entry.entryType === 'debit') {
        totalDebits += entry.amount;
      } else {
        totalCredits += entry.amount;
      }
    }

    // In deposit liability accounting, Credits increase balance, Debits decrease balance
    const netBalance = totalCredits - totalDebits;

    return { totalDebits, totalCredits, netBalance };
  }
}
