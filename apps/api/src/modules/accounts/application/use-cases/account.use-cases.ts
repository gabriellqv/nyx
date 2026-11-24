import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateAccountRequest,
  AccountResponse,
  DepositRequest,
  LedgerReconciliationResponse,
  UserProfile,
  AccountPageResponse,
} from '@nyx/contracts';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { Account } from '../../domain/entities/account.entity';
import { ACCOUNT_REPOSITORY, IAccountRepository } from '../ports/account.repository';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../../customers/application/ports/customer.repository';
import {
  LEDGER_REPOSITORY,
  ILedgerRepository,
} from '../../../ledger/application/ports/ledger.repository';
import { DoubleEntryLedgerService } from '../../../ledger/domain/services/double-entry.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AuditRequestContext, AuditService } from '../../../audit/audit.service';
import { assertCanReadCustomer } from '../../../auth/application/policies/resource-access.policy';
import { hashRequest } from '../../../common/application/request-hash';
import type { CursorPagination } from '../../../common/application/cursor-pagination';

@Injectable()
export class CreateAccountUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
    private readonly doubleEntryService: DoubleEntryLedgerService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    dto: CreateAccountRequest,
    auditContext: AuditRequestContext = {},
  ): Promise<AccountResponse> {
    const customer = await this.customerRepository.findById(dto.customerId);
    if (!customer) {
      throw new NotFoundException(`Customer with id "${dto.customerId}" does not exist`);
    }

    const accountId = randomUUID();
    const accountNumber = `ACC-${Math.floor(10000000 + Math.random() * 90000000)}`;

    const initialAmount = Money.fromMinorUnits(dto.initialDeposit, dto.currency);

    const account = new Account({
      id: accountId,
      customerId: dto.customerId,
      accountNumber,
      currency: dto.currency,
      type: dto.type,
      status: 'active',
      balance: initialAmount,
    });

    await this.prisma.$transaction(async tx => {
      await tx.account.create({
        data: {
          id: account.id,
          customerId: account.customerId,
          accountNumber: account.accountNumber,
          currency: account.currency,
          type: account.type,
          status: account.status,
          balance: account.balance.amount,
          version: account.version,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
      });

      if (initialAmount.isPositive()) {
        const openingFunds = await tx.ledgerAccount.upsert({
          where: { code_currency: { code: 'opening-funds', currency: dto.currency } },
          create: {
            id: randomUUID(),
            code: 'opening-funds',
            name: 'Opening funds clearing',
            currency: dto.currency,
            accountType: 'asset',
          },
          update: {},
        });

        const ledgerTx = this.doubleEntryService.createTransaction({
          description: `Initial deposit for ${accountNumber}`,
          referenceType: 'deposit',
          referenceId: accountId,
          entries: [
            { ledgerAccountId: openingFunds.id, entryType: 'debit', amount: initialAmount },
            { accountId: account.id, entryType: 'credit', amount: initialAmount },
          ],
        });

        await tx.ledgerTransaction.create({
          data: {
            id: ledgerTx.id,
            description: ledgerTx.description,
            referenceType: ledgerTx.referenceType,
            referenceId: ledgerTx.referenceId,
            entries: {
              create: ledgerTx.entries.map(e => ({
                id: e.id,
                accountId: e.accountId,
                ledgerAccountId: e.ledgerAccountId,
                entryType: e.entryType,
                amount: e.amount.amount,
                currency: e.amount.currency,
                sequenceNumber: e.sequenceNumber,
              })),
            },
          },
        });
      }

      await this.auditService.record(
        {
          ...auditContext,
          action: 'ACCOUNT_CREATED',
          resourceType: 'account',
          resourceId: account.id,
          details: {
            accountNumber: account.accountNumber,
            currency: account.currency,
            customerId: account.customerId,
            initialDeposit: dto.initialDeposit,
          },
        },
        tx,
      );
    });

    return this.toResponse(account);
  }

  private toResponse(account: Account): AccountResponse {
    return {
      id: account.id,
      customerId: account.customerId,
      accountNumber: account.accountNumber,
      currency: account.currency,
      type: account.type,
      status: account.status,
      balance: account.balance.amount.toString(),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}

@Injectable()
export class GetAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async execute(id: string, currentUser: UserProfile): Promise<AccountResponse> {
    const account = await this.accountRepository.findById(id);
    if (!account) {
      throw new NotFoundException(`Account with id "${id}" was not found`);
    }

    assertCanReadCustomer(currentUser, account.customerId);

    return {
      id: account.id,
      customerId: account.customerId,
      accountNumber: account.accountNumber,
      currency: account.currency,
      type: account.type,
      status: account.status,
      balance: account.balance.amount.toString(),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    };
  }
}

@Injectable()
export class ListAccountsUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
  ) {}

  async execute(
    currentUser: UserProfile,
    customerId: string | undefined,
    pagination: CursorPagination,
  ): Promise<AccountPageResponse> {
    let accessibleCustomerId = customerId;

    if (currentUser.role === 'user') {
      if (!currentUser.customerId) {
        return { items: [], nextCursor: null, hasMore: false };
      }
      if (customerId && customerId !== currentUser.customerId) {
        assertCanReadCustomer(currentUser, customerId);
      }
      accessibleCustomerId = currentUser.customerId;
    }

    const page = accessibleCustomerId
      ? await this.accountRepository.findByCustomerId(accessibleCustomerId, pagination)
      : await this.accountRepository.findAll(pagination);

    return {
      ...page,
      items: page.items.map(account => ({
        id: account.id,
        customerId: account.customerId,
        accountNumber: account.accountNumber,
        currency: account.currency,
        type: account.type,
        status: account.status,
        balance: account.balance.amount.toString(),
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      })),
    };
  }
}

@Injectable()
export class DepositFundsUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    private readonly doubleEntryService: DoubleEntryLedgerService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    accountId: string,
    dto: DepositRequest,
    auditContext: AuditRequestContext = {},
  ): Promise<AccountResponse> {
    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account with id "${accountId}" was not found`);
    }

    const depositAmount = Money.fromMinorUnits(dto.amount, account.currency);
    const requestHash = hashRequest({
      accountId,
      amount: dto.amount,
      currency: account.currency,
      description: dto.description ?? null,
    });

    const replayDeposit = async (record: {
      requestHash: string;
      responseBody: string;
    }): Promise<AccountResponse> => {
      if (record.requestHash !== requestHash) {
        throw new ConflictException('Idempotency key was reused with different deposit parameters');
      }
      return JSON.parse(record.responseBody) as AccountResponse;
    };

    const existingDeposit = await this.prisma.deposit.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existingDeposit) {
      return replayDeposit(existingDeposit);
    }

    if (!account.isActive()) {
      throw new BadRequestException(`Account is ${account.status} and cannot receive deposits`);
    }

    let transactionResult: AccountResponse;
    try {
      transactionResult = await this.prisma.$transaction(async tx => {
        // Row level lock on account to prevent concurrent modifications
        const [lockedAccount] = await tx.$queryRaw<
          Array<{ id: string; balance: bigint; version: number; status: string }>
        >`
        SELECT id, balance, version, status FROM accounts WHERE id = ${accountId} FOR UPDATE
      `;

        if (!lockedAccount) {
          throw new NotFoundException(`Account with id "${accountId}" not found`);
        }

        const priorDeposit = await tx.deposit.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (priorDeposit) {
          return replayDeposit(priorDeposit);
        }

        if (lockedAccount.status !== 'active') {
          throw new BadRequestException(
            `Account is ${lockedAccount.status} and cannot receive deposits`,
          );
        }

        const newBalance = Money.fromMinorUnits(lockedAccount.balance, account.currency).add(
          depositAmount,
        ).amount;

        const updatedAccount = await tx.account.update({
          where: { id: accountId },
          data: {
            balance: newBalance,
            version: lockedAccount.version + 1,
            updatedAt: new Date(),
          },
        });

        const cashClearing = await tx.ledgerAccount.upsert({
          where: { code_currency: { code: 'cash-clearing', currency: account.currency } },
          create: {
            id: randomUUID(),
            code: 'cash-clearing',
            name: 'Manual cash deposit clearing',
            currency: account.currency,
            accountType: 'asset',
          },
          update: {},
        });

        const ledgerTx = this.doubleEntryService.createTransaction({
          description: dto.description ?? `Deposit to ${account.accountNumber}`,
          referenceType: 'deposit',
          referenceId: account.id,
          entries: [
            { ledgerAccountId: cashClearing.id, entryType: 'debit', amount: depositAmount },
            { accountId: account.id, entryType: 'credit', amount: depositAmount },
          ],
        });

        await tx.ledgerTransaction.create({
          data: {
            id: ledgerTx.id,
            description: ledgerTx.description,
            referenceType: ledgerTx.referenceType,
            referenceId: ledgerTx.referenceId,
            entries: {
              create: ledgerTx.entries.map(e => ({
                id: e.id,
                accountId: e.accountId,
                ledgerAccountId: e.ledgerAccountId,
                entryType: e.entryType,
                amount: e.amount.amount,
                currency: e.amount.currency,
                sequenceNumber: e.sequenceNumber,
              })),
            },
          },
        });

        const response: AccountResponse = {
          id: updatedAccount.id,
          customerId: updatedAccount.customerId,
          accountNumber: updatedAccount.accountNumber,
          currency: updatedAccount.currency,
          type: updatedAccount.type as AccountResponse['type'],
          status: updatedAccount.status as AccountResponse['status'],
          balance: updatedAccount.balance.toString(),
          createdAt: updatedAccount.createdAt.toISOString(),
          updatedAt: updatedAccount.updatedAt.toISOString(),
        };

        await tx.deposit.create({
          data: {
            id: randomUUID(),
            idempotencyKey: dto.idempotencyKey,
            requestHash,
            accountId,
            amount: depositAmount.amount,
            currency: depositAmount.currency,
            description: dto.description ?? null,
            responseBody: JSON.stringify(response),
          },
        });

        await this.auditService.record(
          {
            ...auditContext,
            action: 'FUNDS_DEPOSITED',
            resourceType: 'account',
            resourceId: accountId,
            details: {
              amount: depositAmount.amount.toString(),
              currency: depositAmount.currency,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          tx,
        );

        return response;
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const racedDeposit = await this.prisma.deposit.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (racedDeposit) {
          return replayDeposit(racedDeposit);
        }
      }
      throw error;
    }

    return transactionResult;
  }
}

@Injectable()
export class ReconcileAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(LEDGER_REPOSITORY)
    private readonly ledgerRepository: ILedgerRepository,
  ) {}

  async execute(
    accountId: string,
    currentUser: UserProfile,
  ): Promise<LedgerReconciliationResponse> {
    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account with id "${accountId}" was not found`);
    }

    assertCanReadCustomer(currentUser, account.customerId);

    const { totalDebits, totalCredits, netBalance } =
      await this.ledgerRepository.calculateAccountBalance(accountId);

    const isReconciled = account.balance.amount === netBalance;
    const discrepancy = account.balance.amount - netBalance;

    return {
      accountId,
      accountBalance: account.balance.amount.toString(),
      ledgerDerivedBalance: netBalance.toString(),
      isReconciled,
      totalDebits: totalDebits.toString(),
      totalCredits: totalCredits.toString(),
      discrepancy: discrepancy.toString(),
    };
  }
}
