import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CreatePaymentRequest, PaymentResponse, UserProfile } from '@nyx/contracts';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { Payment } from '../../domain/entities/payment.entity';
import { PAYMENT_REPOSITORY, IPaymentRepository } from '../ports/payment.repository';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { OutboxService } from '../../../outbox/outbox.service';
import { assertCanReadCustomer } from '../../../auth/application/policies/resource-access.policy';
import { DoubleEntryLedgerService } from '../../../ledger/domain/services/double-entry.service';
import { hashRequest, isUniqueConstraintError } from '../../../common/application/request-hash';

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
export class ProcessPaymentUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly doubleEntryService: DoubleEntryLedgerService,
  ) {}

  async execute(dto: CreatePaymentRequest): Promise<PaymentResponse> {
    const requestHash = hashRequest({
      destinationAccountId: dto.destinationAccountId,
      amount: dto.amount,
      currency: dto.currency.toUpperCase(),
      method: dto.method,
      description: dto.description ?? null,
    });

    const matchesRequest = (existing: Payment): boolean => {
      if (existing.requestHash) {
        return existing.requestHash === requestHash;
      }
      return (
        existing.destinationAccountId === dto.destinationAccountId &&
        existing.amount.amount === BigInt(dto.amount) &&
        existing.amount.currency === dto.currency.toUpperCase() &&
        existing.method === dto.method &&
        existing.description === (dto.description ?? null)
      );
    };

    const existing = await this.paymentRepository.findByIdempotencyKey(dto.idempotencyKey);
    if (existing) {
      if (matchesRequest(existing)) {
        return this.toResponse(existing);
      }
      throw new ConflictException(
        `Idempotency key "${dto.idempotencyKey}" already exists with different payment parameters`,
      );
    }

    const paymentAmount = Money.fromCents(dto.amount, dto.currency);
    const paymentId = randomUUID();

    // 2. Process payment atomically inside database transaction
    let transactionResult: { payment: Payment; replayed: boolean };
    try {
      transactionResult = await this.prisma.$transaction(async tx => {
        // Row lock on destination account
        const rows = await tx.$queryRaw<LockedAccountRow[]>`
        SELECT id, customer_id, account_number, balance, currency, status, version
        FROM accounts
        WHERE id = ${dto.destinationAccountId}
        FOR UPDATE
      `;

        if (rows.length === 0 || !rows[0]) {
          throw new NotFoundException(
            `Destination account "${dto.destinationAccountId}" not found`,
          );
        }

        const accountRow = rows[0];

        const duplicate = await tx.payment.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (duplicate) {
          const duplicatePayment = new Payment({
            id: duplicate.id,
            idempotencyKey: duplicate.idempotencyKey,
            requestHash: duplicate.requestHash,
            destinationAccountId: duplicate.destinationAccountId,
            amount: Money.fromCents(duplicate.amount, duplicate.currency),
            method: duplicate.method as CreatePaymentRequest['method'],
            status: duplicate.status as 'completed' | 'failed' | 'pending',
            description: duplicate.description,
            createdAt: duplicate.createdAt,
            completedAt: duplicate.completedAt,
          });
          if (!matchesRequest(duplicatePayment)) {
            throw new ConflictException(
              `Idempotency key "${dto.idempotencyKey}" already exists with different payment parameters`,
            );
          }
          return { payment: duplicatePayment, replayed: true };
        }

        if (accountRow.status !== 'active') {
          throw new BadRequestException(
            `Destination account "${dto.destinationAccountId}" is not active`,
          );
        }

        if (accountRow.currency !== dto.currency) {
          throw new BadRequestException(
            `Currency mismatch: account operates in ${accountRow.currency}, payment is in ${dto.currency}`,
          );
        }

        const currentBalance = Money.fromCents(accountRow.balance, accountRow.currency);
        const updatedBalance = currentBalance.add(paymentAmount);

        // Update account balance
        await tx.account.update({
          where: { id: accountRow.id },
          data: {
            balance: updatedBalance.amount,
            version: accountRow.version + 1,
          },
        });

        const clearingAccount = await tx.ledgerAccount.upsert({
          where: { code_currency: { code: 'payment-clearing', currency: paymentAmount.currency } },
          create: {
            id: randomUUID(),
            code: 'payment-clearing',
            name: 'Incoming payment clearing',
            currency: paymentAmount.currency,
            accountType: 'asset',
          },
          update: {},
        });

        const ledgerTransaction = this.doubleEntryService.createIncomingPaymentTransaction({
          paymentId,
          destinationAccountId: accountRow.id,
          clearingLedgerAccountId: clearingAccount.id,
          amount: paymentAmount,
          description: `Payment received via ${dto.method}: ${dto.description ?? 'incoming funds'}`,
        });

        await tx.ledgerTransaction.create({
          data: {
            id: ledgerTransaction.id,
            description: ledgerTransaction.description,
            referenceType: ledgerTransaction.referenceType,
            referenceId: ledgerTransaction.referenceId,
            entries: {
              create: ledgerTransaction.entries.map(entry => ({
                id: entry.id,
                accountId: entry.accountId,
                ledgerAccountId: entry.ledgerAccountId,
                entryType: entry.entryType,
                amount: entry.amount.amount,
                currency: entry.amount.currency,
                sequenceNumber: entry.sequenceNumber,
              })),
            },
          },
        });

        // Persist payment record
        const rawPayment = await tx.payment.create({
          data: {
            id: paymentId,
            idempotencyKey: dto.idempotencyKey,
            requestHash,
            destinationAccountId: accountRow.id,
            amount: paymentAmount.amount,
            currency: paymentAmount.currency,
            method: dto.method,
            status: 'completed',
            description: dto.description ?? null,
            completedAt: new Date(),
          },
        });

        // Atomically record Outbox event within the exact same database transaction
        await this.outboxService.recordEvent(
          {
            eventType: 'payment.completed',
            aggregateType: 'payment',
            aggregateId: paymentId,
            payload: {
              paymentId,
              destinationAccountId: accountRow.id,
              amount: paymentAmount.amountNumber,
              currency: paymentAmount.currency,
              method: dto.method,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          tx,
        );

        return {
          payment: new Payment({
            id: rawPayment.id,
            idempotencyKey: rawPayment.idempotencyKey,
            requestHash: rawPayment.requestHash,
            destinationAccountId: rawPayment.destinationAccountId,
            amount: paymentAmount,
            method: dto.method,
            status: 'completed',
            description: rawPayment.description,
            createdAt: rawPayment.createdAt,
            completedAt: rawPayment.completedAt,
          }),
          replayed: false,
        };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const racedPayment = await this.paymentRepository.findByIdempotencyKey(dto.idempotencyKey);
        if (racedPayment) {
          if (matchesRequest(racedPayment)) {
            return this.toResponse(racedPayment);
          }
          throw new ConflictException(
            `Idempotency key "${dto.idempotencyKey}" already exists with different payment parameters`,
          );
        }
      }
      throw error;
    }

    const savedPayment = transactionResult.payment;
    if (!transactionResult.replayed) {
      await this.auditService.record({
        action: 'PAYMENT_PROCESSED',
        resourceType: 'payment',
        resourceId: savedPayment.id,
        details: {
          destinationAccountId: savedPayment.destinationAccountId,
          amount: savedPayment.amount.amountNumber,
          currency: savedPayment.amount.currency,
          method: savedPayment.method,
          idempotencyKey: savedPayment.idempotencyKey,
        },
      });
    }

    return this.toResponse(savedPayment);
  }

  private toResponse(payment: Payment): PaymentResponse {
    return {
      id: payment.id,
      destinationAccountId: payment.destinationAccountId,
      amount: payment.amount.amountNumber,
      currency: payment.amount.currency,
      method: payment.method,
      status: payment.status,
      idempotencyKey: payment.idempotencyKey,
      description: payment.description,
      createdAt: payment.createdAt.toISOString(),
      completedAt: payment.completedAt ? payment.completedAt.toISOString() : null,
    };
  }
}

@Injectable()
export class GetPaymentUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(id: string, currentUser: UserProfile): Promise<PaymentResponse> {
    const payment = await this.paymentRepository.findById(id);
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    const account = await this.prisma.account.findUnique({
      where: { id: payment.destinationAccountId },
      select: { customerId: true },
    });
    if (!account) {
      throw new NotFoundException(`Destination account ${payment.destinationAccountId} not found`);
    }
    assertCanReadCustomer(currentUser, account.customerId);

    return {
      id: payment.id,
      destinationAccountId: payment.destinationAccountId,
      amount: payment.amount.amountNumber,
      currency: payment.amount.currency,
      method: payment.method,
      status: payment.status,
      idempotencyKey: payment.idempotencyKey,
      description: payment.description,
      createdAt: payment.createdAt.toISOString(),
      completedAt: payment.completedAt ? payment.completedAt.toISOString() : null,
    };
  }
}

@Injectable()
export class ListPaymentsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(accountId: string, currentUser: UserProfile): Promise<PaymentResponse[]> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { customerId: true },
    });
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }
    assertCanReadCustomer(currentUser, account.customerId);

    const payments = await this.paymentRepository.findByAccountId(accountId);
    return payments.map(payment => ({
      id: payment.id,
      destinationAccountId: payment.destinationAccountId,
      amount: payment.amount.amountNumber,
      currency: payment.amount.currency,
      method: payment.method,
      status: payment.status,
      idempotencyKey: payment.idempotencyKey,
      description: payment.description,
      createdAt: payment.createdAt.toISOString(),
      completedAt: payment.completedAt ? payment.completedAt.toISOString() : null,
    }));
  }
}
