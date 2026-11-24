import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ReconciliationReport,
  AccountReconciliationDetail,
  RunReconciliationRequest,
} from '@nyx/contracts';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AuditRequestContext, AuditService } from '../audit/audit.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Executes a complete reconciliation audit between account balances
   * and double-entry ledger postings.
   */
  async runReconciliation(
    dto?: RunReconciliationRequest,
    auditContext: AuditRequestContext = {},
  ): Promise<ReconciliationReport> {
    const reportId = randomUUID();
    const executedAt = new Date().toISOString();

    const where = dto?.accountId ? { id: dto.accountId } : {};
    const accounts = await this.prisma.account.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const details: AccountReconciliationDetail[] = [];
    let balancedCount = 0;
    let discrepantCount = 0;

    for (const account of accounts) {
      // Calculate total credits and debits from ledger entries for this account
      const creditsAgg = await this.prisma.ledgerEntry.aggregate({
        where: { accountId: account.id, entryType: 'credit' },
        _sum: { amount: true },
      });
      const debitsAgg = await this.prisma.ledgerEntry.aggregate({
        where: { accountId: account.id, entryType: 'debit' },
        _sum: { amount: true },
      });

      const totalCredits = creditsAgg._sum.amount ?? 0n;
      const totalDebits = debitsAgg._sum.amount ?? 0n;
      const ledgerBalance = totalCredits - totalDebits;

      const accountBalance = account.balance;
      const discrepancy = accountBalance - ledgerBalance;
      const isBalanced = BigInt(discrepancy) === 0n;

      if (isBalanced) {
        balancedCount++;
      } else {
        discrepantCount++;
        this.logger.error(
          `Reconciliation discrepancy on account ${account.accountNumber} (${account.id}): ` +
            `account balance = ${accountBalance}, ledger balance = ${ledgerBalance}`,
        );
      }

      details.push({
        accountId: account.id,
        accountNumber: account.accountNumber,
        currency: account.currency,
        accountBalance: accountBalance.toString(),
        ledgerBalance: ledgerBalance.toString(),
        discrepancy: discrepancy.toString(),
        isBalanced,
      });
    }

    const status = discrepantCount === 0 ? ('balanced' as const) : ('discrepant' as const);

    const report: ReconciliationReport = {
      id: reportId,
      totalAccountsAudited: accounts.length,
      balancedAccountsCount: balancedCount,
      discrepantAccountsCount: discrepantCount,
      status,
      executedAt,
      details,
    };

    // Persist immutable reconciliation audit log
    await this.prisma.$transaction(async tx => {
      await tx.reconciliationLog.create({
        data: {
          id: reportId,
          totalAccountsAudited: accounts.length,
          balancedAccountsCount: balancedCount,
          discrepantAccountsCount: discrepantCount,
          status,
          details: JSON.stringify(details),
          createdAt: new Date(executedAt),
        },
      });

      await this.auditService.record(
        {
          ...auditContext,
          action: 'RECONCILIATION_COMPLETED',
          resourceType: 'reconciliation',
          resourceId: reportId,
          details: {
            totalAccounts: accounts.length,
            balancedCount,
            discrepantCount,
            status,
          },
        },
        tx,
      );
    });

    return report;
  }

  /**
   * Retrieves previous reconciliation reports from database.
   */
  async getHistory(limit = 20): Promise<ReconciliationReport[]> {
    const logs = await this.prisma.reconciliationLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return logs.map(log => ({
      id: log.id,
      totalAccountsAudited: log.totalAccountsAudited,
      balancedAccountsCount: log.balancedAccountsCount,
      discrepantAccountsCount: log.discrepantAccountsCount,
      status: log.status as 'balanced' | 'discrepant',
      executedAt: log.createdAt.toISOString(),
      details: JSON.parse(log.details) as AccountReconciliationDetail[],
    }));
  }
}
