import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateAccountRequest,
  AccountResponse,
  DepositRequest,
  LedgerReconciliationResponse,
  UserProfile,
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
import { AuditService } from '../../../audit/audit.service';
import { assertCanReadCustomer } from '../../../auth/application/policies/resource-access.policy';

@Injectable()
export class CreateAccountUseCase {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: IAccountRepository,
    @Inject(CUSTOMER_REPOSITORY)
    private readonly customerRepository: ICustomerRepository,
    private readonly doubleEntryService: DoubleEntryLedgerService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async execute(dto: CreateAccountRequest): Promise<AccountResponse> {
    const customer = await this.customerRepository.findById(dto.customerId);
    if (!customer) {
      throw new NotFoundException(`Customer with id "${dto.customerId}" does not exist`);
    }

    const accountId = randomUUID();
    const accountNumber = `ACC-${Math.floor(10000000 + Math.random() * 90000000)}`;

    const initialAmount = Money.fromCents(dto.initialDeposit, dto.currency);

    const account = new Account({
      id: accountId,
      customerId: dto.customerId,
      accountNumber,
      currency: dto.currency,
      type: dto.type,
      status: 'active',
      balance: initialAmount,
    });

    if (initialAmount.isPositive()) {
      // Find or create internal vault/treasury account for double-entry balancing
      let treasury = await this.accountRepository.findByAccountNumber('ACC-TREASURY');
      if (!treasury) {
        treasury = new Account({
          id: randomUUID(),
          customerId: customer.id,
          accountNumber: 'ACC-TREASURY',
          currency: dto.currency,
          type: 'internal',
          status: 'active',
          balance: Money.zero(dto.currency),
        });
        await this.accountRepository.save(treasury);
      }

      const ledgerTx = this.doubleEntryService.createTransaction({
        description: `Initial deposit for ${accountNumber}`,
        referenceType: 'deposit',
        referenceId: accountId,
        entries: [
          { accountId: treasury.id, entryType: 'debit', amount: initialAmount },
          { accountId: account.id, entryType: 'credit', amount: initialAmount },
        ],
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
          },
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
                entryType: e.entryType,
                amount: e.amount.amount,
                currency: e.amount.currency,
                sequenceNumber: e.sequenceNumber,
              })),
            },
          },
        });
      });
    } else {
      await this.accountRepository.save(account);
    }

    await this.auditService.record({
      action: 'ACCOUNT_CREATED',
      resourceType: 'account',
      resourceId: account.id,
      details: {
        accountNumber: account.accountNumber,
        currency: account.currency,
        customerId: account.customerId,
        initialDeposit: dto.initialDeposit,
      },
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
      balance: account.balance.amountNumber,
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
      balance: account.balance.amountNumber,
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

  async execute(currentUser: UserProfile, customerId?: string): Promise<AccountResponse[]> {
    let accessibleCustomerId = customerId;

    if (currentUser.role === 'user') {
      if (!currentUser.customerId) {
        return [];
      }
      if (customerId && customerId !== currentUser.customerId) {
        assertCanReadCustomer(currentUser, customerId);
      }
      accessibleCustomerId = currentUser.customerId;
    }

    const accounts = accessibleCustomerId
      ? await this.accountRepository.findByCustomerId(accessibleCustomerId)
      : await this.accountRepository.findAll();

    return accounts.map(account => ({
      id: account.id,
      customerId: account.customerId,
      accountNumber: account.accountNumber,
      currency: account.currency,
      type: account.type,
      status: account.status,
      balance: account.balance.amountNumber,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    }));
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

  async execute(accountId: string, dto: DepositRequest): Promise<AccountResponse> {
    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new NotFoundException(`Account with id "${accountId}" was not found`);
    }

    if (!account.isActive()) {
      throw new BadRequestException(`Account is ${account.status} and cannot receive deposits`);
    }

    const depositAmount = Money.fromCents(dto.amount, account.currency);

    // Retrieve or provision internal treasury account
    let treasury = await this.accountRepository.findByAccountNumber('ACC-TREASURY');
    if (!treasury) {
      treasury = new Account({
        id: randomUUID(),
        customerId: account.customerId,
        accountNumber: 'ACC-TREASURY',
        currency: account.currency,
        type: 'internal',
        status: 'active',
        balance: Money.zero(account.currency),
      });
      await this.accountRepository.save(treasury);
    }

    const ledgerTx = this.doubleEntryService.createTransaction({
      description: dto.description ?? `Deposit to ${account.accountNumber}`,
      referenceType: 'deposit',
      referenceId: account.id,
      entries: [
        { accountId: treasury.id, entryType: 'debit', amount: depositAmount },
        { accountId: account.id, entryType: 'credit', amount: depositAmount },
      ],
    });

    await this.prisma.$transaction(async tx => {
      // Row level lock on account to prevent concurrent modifications
      const [lockedAccount] = await tx.$queryRaw<
        Array<{ id: string; balance: bigint; version: number }>
      >`
        SELECT id, balance, version FROM accounts WHERE id = ${accountId} FOR UPDATE
      `;

      if (!lockedAccount) {
        throw new NotFoundException(`Account with id "${accountId}" not found`);
      }

      const newBalance = lockedAccount.balance + depositAmount.amount;

      await tx.account.update({
        where: { id: accountId },
        data: {
          balance: newBalance,
          version: lockedAccount.version + 1,
          updatedAt: new Date(),
        },
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
              entryType: e.entryType,
              amount: e.amount.amount,
              currency: e.amount.currency,
              sequenceNumber: e.sequenceNumber,
            })),
          },
        },
      });
    });

    const updatedAccount = await this.accountRepository.findById(accountId);
    if (!updatedAccount) {
      throw new NotFoundException(`Account ${accountId} not found after update`);
    }

    await this.auditService.record({
      action: 'FUNDS_DEPOSITED',
      resourceType: 'account',
      resourceId: accountId,
      details: {
        amount: depositAmount.amountNumber,
        currency: depositAmount.currency,
        idempotencyKey: dto.idempotencyKey,
      },
    });

    return {
      id: updatedAccount.id,
      customerId: updatedAccount.customerId,
      accountNumber: updatedAccount.accountNumber,
      currency: updatedAccount.currency,
      type: updatedAccount.type,
      status: updatedAccount.status,
      balance: updatedAccount.balance.amountNumber,
      createdAt: updatedAccount.createdAt.toISOString(),
      updatedAt: updatedAccount.updatedAt.toISOString(),
    };
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
    const discrepancy = Number(account.balance.amount - netBalance);

    return {
      accountId,
      accountBalance: account.balance.amountNumber,
      ledgerDerivedBalance: Number(netBalance),
      isReconciled,
      totalDebits: Number(totalDebits),
      totalCredits: Number(totalCredits),
      discrepancy,
    };
  }
}
