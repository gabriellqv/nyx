import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateTransferRequest,
  ReverseTransferRequest,
  TransferResponse,
  UserProfile,
} from '@nyx/contracts';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { Transfer } from '../../domain/entities/transfer.entity';
import { TRANSFER_REPOSITORY, ITransferRepository } from '../ports/transfer.repository';
import { DoubleEntryLedgerService } from '../../../ledger/domain/services/double-entry.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { OutboxService } from '../../../outbox/outbox.service';

interface LockedAccountRow {
  id: string;
  customer_id: string;
  account_number: string;
  balance: bigint;
  currency: string;
  status: string;
  version: number;
}

@Injectable()
export class ExecuteTransferUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY)
    private readonly transferRepository: ITransferRepository,
    private readonly doubleEntryService: DoubleEntryLedgerService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async execute(dto: CreateTransferRequest, currentUser: UserProfile): Promise<TransferResponse> {
    if (dto.sourceAccountId === dto.destinationAccountId) {
      throw new BadRequestException('Source and destination accounts must be distinct');
    }

    const sourceAccount = await this.prisma.account.findUnique({
      where: { id: dto.sourceAccountId },
      select: { customerId: true },
    });
    if (!sourceAccount) {
      throw new NotFoundException(`Source account "${dto.sourceAccountId}" does not exist`);
    }
    if (
      currentUser.role !== 'admin' &&
      (!currentUser.customerId || sourceAccount.customerId !== currentUser.customerId)
    ) {
      throw new ForbiddenException(
        'Forbidden: authenticated user is not authorized to debit this source account',
      );
    }

    // 1. Idempotency Check
    const existingTransfer = await this.transferRepository.findByIdempotencyKey(dto.idempotencyKey);
    if (existingTransfer) {
      const isSameRequest =
        existingTransfer.sourceAccountId === dto.sourceAccountId &&
        existingTransfer.destinationAccountId === dto.destinationAccountId &&
        existingTransfer.amount.amountNumber === dto.amount &&
        existingTransfer.amount.currency === dto.currency.toUpperCase();

      if (isSameRequest) {
        return this.toResponse(existingTransfer);
      }

      throw new ConflictException(
        `Idempotency key "${dto.idempotencyKey}" was already used with conflicting parameters`,
      );
    }

    const transferAmount = Money.fromCents(dto.amount, dto.currency);
    const transferId = randomUUID();

    // 2. Atomic Database Transaction with Deterministic Ordered Locking
    const savedTransfer = await this.prisma.$transaction(async tx => {
      // Order IDs deterministically to prevent cross-account deadlocks under concurrent requests
      const [firstId, secondId] =
        dto.sourceAccountId < dto.destinationAccountId
          ? [dto.sourceAccountId, dto.destinationAccountId]
          : [dto.destinationAccountId, dto.sourceAccountId];

      const firstRows = await tx.$queryRaw<LockedAccountRow[]>`
        SELECT id, customer_id, account_number, balance, currency, status, version
        FROM accounts
        WHERE id = ${firstId}
        FOR UPDATE
      `;
      const secondRows = await tx.$queryRaw<LockedAccountRow[]>`
        SELECT id, customer_id, account_number, balance, currency, status, version
        FROM accounts
        WHERE id = ${secondId}
        FOR UPDATE
      `;

      const firstAccount = firstRows[0];
      const secondAccount = secondRows[0];

      if (!firstAccount || !secondAccount) {
        throw new NotFoundException('One or both specified transfer accounts do not exist');
      }

      const sourceRow = firstAccount.id === dto.sourceAccountId ? firstAccount : secondAccount;
      const destRow = firstAccount.id === dto.destinationAccountId ? firstAccount : secondAccount;

      // Enforce account ownership access boundary
      if (
        currentUser.role !== 'admin' &&
        (!currentUser.customerId || sourceRow.customer_id !== currentUser.customerId)
      ) {
        throw new ForbiddenException(
          'Forbidden: authenticated user is not authorized to debit this source account',
        );
      }

      // Validate account statuses
      if (sourceRow.status !== 'active') {
        throw new BadRequestException(
          `Source account ${sourceRow.account_number} is ${sourceRow.status} and cannot initiate transfers`,
        );
      }
      if (destRow.status !== 'active') {
        throw new BadRequestException(
          `Destination account ${destRow.account_number} is ${destRow.status} and cannot receive transfers`,
        );
      }

      // Validate currencies
      if (sourceRow.currency !== transferAmount.currency) {
        throw new BadRequestException(
          `Source account currency (${sourceRow.currency}) does not match transfer currency (${transferAmount.currency})`,
        );
      }
      if (destRow.currency !== transferAmount.currency) {
        throw new BadRequestException(
          `Destination account currency (${destRow.currency}) does not match transfer currency (${transferAmount.currency})`,
        );
      }

      // Validate sufficient funds
      if (sourceRow.balance < transferAmount.amount) {
        throw new BadRequestException(
          `Source account has insufficient funds. Available: ${Number(sourceRow.balance)}, Requested: ${transferAmount.amountNumber}`,
        );
      }

      // Update balances
      const newSourceBalance = sourceRow.balance - transferAmount.amount;
      const newDestBalance = destRow.balance + transferAmount.amount;

      await tx.account.update({
        where: { id: sourceRow.id },
        data: {
          balance: newSourceBalance,
          version: sourceRow.version + 1,
          updatedAt: new Date(),
        },
      });

      await tx.account.update({
        where: { id: destRow.id },
        data: {
          balance: newDestBalance,
          version: destRow.version + 1,
          updatedAt: new Date(),
        },
      });

      // Generate and post double-entry ledger transaction
      const ledgerTx = this.doubleEntryService.createTransferTransaction({
        transferId,
        sourceAccountId: sourceRow.id,
        destinationAccountId: destRow.id,
        amount: transferAmount,
        description:
          dto.description ??
          `Transfer from ${sourceRow.account_number} to ${destRow.account_number}`,
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

      // Persist transfer record
      const record = await tx.transfer.create({
        data: {
          id: transferId,
          idempotencyKey: dto.idempotencyKey,
          sourceAccountId: sourceRow.id,
          destinationAccountId: destRow.id,
          amount: transferAmount.amount,
          currency: transferAmount.currency,
          status: 'posted',
          description: dto.description ?? null,
          completedAt: new Date(),
        },
      });

      // Atomically persist Outbox event for asynchronous notification
      await this.outboxService.recordEvent(
        {
          eventType: 'transfer.posted',
          aggregateType: 'transfer',
          aggregateId: record.id,
          payload: {
            transferId: record.id,
            sourceAccountId: record.sourceAccountId,
            destinationAccountId: record.destinationAccountId,
            amount: transferAmount.amountNumber,
            currency: transferAmount.currency,
            idempotencyKey: record.idempotencyKey,
          },
        },
        tx,
      );

      return new Transfer({
        id: record.id,
        idempotencyKey: record.idempotencyKey,
        sourceAccountId: record.sourceAccountId,
        destinationAccountId: record.destinationAccountId,
        amount: Money.fromCents(record.amount, record.currency),
        status: 'posted',
        description: record.description,
        completedAt: record.completedAt,
      });
    });

    await this.auditService.record({
      action: 'TRANSFER_POSTED',
      resourceType: 'transfer',
      resourceId: savedTransfer.id,
      details: {
        sourceAccountId: savedTransfer.sourceAccountId,
        destinationAccountId: savedTransfer.destinationAccountId,
        amount: savedTransfer.amount.amountNumber,
        currency: savedTransfer.amount.currency,
        idempotencyKey: savedTransfer.idempotencyKey,
      },
    });

    return this.toResponse(savedTransfer);
  }

  private toResponse(transfer: Transfer): TransferResponse {
    return {
      id: transfer.id,
      sourceAccountId: transfer.sourceAccountId,
      destinationAccountId: transfer.destinationAccountId,
      amount: transfer.amount.amountNumber,
      currency: transfer.amount.currency,
      status: transfer.status,
      idempotencyKey: transfer.idempotencyKey,
      description: transfer.description,
      failureReason: transfer.failureReason,
      createdAt: transfer.createdAt.toISOString(),
      completedAt: transfer.completedAt ? transfer.completedAt.toISOString() : null,
    };
  }
}

@Injectable()
export class GetTransferUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY)
    private readonly transferRepository: ITransferRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(id: string, currentUser: UserProfile): Promise<TransferResponse> {
    const transfer = await this.transferRepository.findById(id);
    if (!transfer) {
      throw new NotFoundException(`Transfer with id "${id}" was not found`);
    }

    if (currentUser.role === 'user') {
      if (!currentUser.customerId) {
        throw new ForbiddenException('User is not authorized to access this transfer');
      }

      const ownedAccounts = await this.prisma.account.count({
        where: {
          id: { in: [transfer.sourceAccountId, transfer.destinationAccountId] },
          customerId: currentUser.customerId,
        },
      });

      if (ownedAccounts === 0) {
        throw new ForbiddenException('User is not authorized to access this transfer');
      }
    }

    return {
      id: transfer.id,
      sourceAccountId: transfer.sourceAccountId,
      destinationAccountId: transfer.destinationAccountId,
      amount: transfer.amount.amountNumber,
      currency: transfer.amount.currency,
      status: transfer.status,
      idempotencyKey: transfer.idempotencyKey,
      description: transfer.description,
      failureReason: transfer.failureReason,
      createdAt: transfer.createdAt.toISOString(),
      completedAt: transfer.completedAt ? transfer.completedAt.toISOString() : null,
    };
  }
}

@Injectable()
export class ListTransfersUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY)
    private readonly transferRepository: ITransferRepository,
  ) {}

  async execute(
    currentUser: UserProfile,
    filters?: {
      accountId?: string | undefined;
      status?: string | undefined;
    },
  ): Promise<TransferResponse[]> {
    if (currentUser.role === 'user' && !currentUser.customerId) {
      return [];
    }

    const transfers = await this.transferRepository.findAll({
      ...filters,
      customerId: currentUser.role === 'user' ? (currentUser.customerId ?? undefined) : undefined,
    });
    return transfers.map(t => ({
      id: t.id,
      sourceAccountId: t.sourceAccountId,
      destinationAccountId: t.destinationAccountId,
      amount: t.amount.amountNumber,
      currency: t.amount.currency,
      status: t.status,
      idempotencyKey: t.idempotencyKey,
      description: t.description,
      failureReason: t.failureReason,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    }));
  }
}

@Injectable()
export class ReverseTransferUseCase {
  constructor(
    @Inject(TRANSFER_REPOSITORY)
    private readonly transferRepository: ITransferRepository,
    private readonly doubleEntryService: DoubleEntryLedgerService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
  ) {}

  async execute(transferId: string, dto: ReverseTransferRequest): Promise<TransferResponse> {
    const transfer = await this.transferRepository.findById(transferId);
    if (!transfer) {
      throw new NotFoundException(`Transfer with id "${transferId}" was not found`);
    }

    if (transfer.status !== 'posted') {
      throw new BadRequestException(
        `Only transfers in "posted" status can be reversed. Current status: ${transfer.status}`,
      );
    }

    // Atomic Reversal Transaction
    await this.prisma.$transaction(async tx => {
      // Deterministic lock
      const [firstId, secondId] =
        transfer.sourceAccountId < transfer.destinationAccountId
          ? [transfer.sourceAccountId, transfer.destinationAccountId]
          : [transfer.destinationAccountId, transfer.sourceAccountId];

      const firstRows = await tx.$queryRaw<LockedAccountRow[]>`
        SELECT id, account_number, balance, currency, status, version
        FROM accounts
        WHERE id = ${firstId}
        FOR UPDATE
      `;
      const secondRows = await tx.$queryRaw<LockedAccountRow[]>`
        SELECT id, account_number, balance, currency, status, version
        FROM accounts
        WHERE id = ${secondId}
        FOR UPDATE
      `;

      const sourceAccount =
        firstRows[0]?.id === transfer.sourceAccountId ? firstRows[0] : secondRows[0];
      const destAccount =
        firstRows[0]?.id === transfer.destinationAccountId ? firstRows[0] : secondRows[0];

      if (!sourceAccount || !destAccount) {
        throw new NotFoundException('Transfer accounts could not be locked for reversal');
      }

      // In a reversal, destinationAccount (which received funds) must return them
      if (destAccount.balance < transfer.amount.amount) {
        throw new BadRequestException(
          `Destination account ${destAccount.account_number} does not have sufficient funds to reverse this transfer`,
        );
      }

      // Update balances in reverse
      await tx.account.update({
        where: { id: destAccount.id },
        data: {
          balance: destAccount.balance - transfer.amount.amount,
          version: destAccount.version + 1,
          updatedAt: new Date(),
        },
      });

      await tx.account.update({
        where: { id: sourceAccount.id },
        data: {
          balance: sourceAccount.balance + transfer.amount.amount,
          version: sourceAccount.version + 1,
          updatedAt: new Date(),
        },
      });

      // Post balanced reversal in ledger
      const reversalLedgerTx = this.doubleEntryService.createReversalTransaction({
        originalTransferId: transfer.id,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destAccount.id,
        amount: transfer.amount,
        reason: dto.reason,
      });

      await tx.ledgerTransaction.create({
        data: {
          id: reversalLedgerTx.id,
          description: reversalLedgerTx.description,
          referenceType: reversalLedgerTx.referenceType,
          referenceId: reversalLedgerTx.referenceId,
          entries: {
            create: reversalLedgerTx.entries.map(e => ({
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

      // Mark original transfer as reversed
      await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          status: 'reversed',
          failureReason: `Reversed: ${dto.reason}`,
          completedAt: new Date(),
        },
      });

      // Atomically persist Outbox event for reversal
      await this.outboxService.recordEvent(
        {
          eventType: 'transfer.reversed',
          aggregateType: 'transfer',
          aggregateId: transfer.id,
          payload: {
            transferId: transfer.id,
            reason: dto.reason,
            amount: transfer.amount.amountNumber,
            currency: transfer.amount.currency,
          },
        },
        tx,
      );
    });

    await this.auditService.record({
      action: 'TRANSFER_REVERSED',
      resourceType: 'transfer',
      resourceId: transferId,
      details: {
        reason: dto.reason,
        amount: transfer.amount.amountNumber,
      },
    });

    const updated = await this.transferRepository.findById(transferId);
    if (!updated) {
      throw new NotFoundException(`Transfer ${transferId} not found after reversal`);
    }

    return {
      id: updated.id,
      sourceAccountId: updated.sourceAccountId,
      destinationAccountId: updated.destinationAccountId,
      amount: updated.amount.amountNumber,
      currency: updated.amount.currency,
      status: updated.status,
      idempotencyKey: updated.idempotencyKey,
      description: updated.description,
      failureReason: updated.failureReason,
      createdAt: updated.createdAt.toISOString(),
      completedAt: updated.completedAt ? updated.completedAt.toISOString() : null,
    };
  }
}
