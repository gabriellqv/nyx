import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { Transfer, TransferStatus } from '../../domain/entities/transfer.entity';
import { ITransferRepository } from '../../application/ports/transfer.repository';
import { makeCursorPage } from '../../../common/application/cursor-pagination';

@Injectable()
export class PrismaTransferRepository implements ITransferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Transfer | null> {
    const record = await this.prisma.transfer.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Transfer | null> {
    const record = await this.prisma.transfer.findUnique({ where: { idempotencyKey: key } });
    return record ? this.toDomain(record) : null;
  }

  async findAll(filters: {
    accountId?: string | undefined;
    status?: string | undefined;
    customerId?: string | undefined;
    pagination: { limit: number; cursor?: string | undefined };
  }) {
    const where: Record<string, unknown> = {};

    if (filters?.accountId) {
      where.OR = [
        { sourceAccountId: filters.accountId },
        { destinationAccountId: filters.accountId },
      ];
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.customerId) {
      const ownershipFilter = {
        OR: [
          { sourceAccount: { customerId: filters.customerId } },
          { destinationAccount: { customerId: filters.customerId } },
        ],
      };

      if (where.OR) {
        where.AND = [{ OR: where.OR }, ownershipFilter];
        delete where.OR;
      } else {
        Object.assign(where, ownershipFilter);
      }
    }

    const records = await this.prisma.transfer.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.pagination.limit + 1,
      ...(filters.pagination.cursor ? { cursor: { id: filters.pagination.cursor }, skip: 1 } : {}),
    });

    return makeCursorPage(
      records.map(r => this.toDomain(r)),
      filters.pagination.limit,
    );
  }

  async save(transfer: Transfer): Promise<Transfer> {
    const record = await this.prisma.transfer.upsert({
      where: { id: transfer.id },
      create: {
        id: transfer.id,
        idempotencyKey: transfer.idempotencyKey,
        requestHash: transfer.requestHash,
        sourceAccountId: transfer.sourceAccountId,
        destinationAccountId: transfer.destinationAccountId,
        amount: transfer.amount.amount,
        currency: transfer.amount.currency,
        status: transfer.status,
        description: transfer.description,
        failureReason: transfer.failureReason,
        createdAt: transfer.createdAt,
        completedAt: transfer.completedAt,
      },
      update: {
        status: transfer.status,
        failureReason: transfer.failureReason,
        completedAt: transfer.completedAt,
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    idempotencyKey: string;
    requestHash: string | null;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: bigint;
    currency: string;
    status: string;
    description: string | null;
    failureReason: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): Transfer {
    return new Transfer({
      id: record.id,
      idempotencyKey: record.idempotencyKey,
      requestHash: record.requestHash,
      sourceAccountId: record.sourceAccountId,
      destinationAccountId: record.destinationAccountId,
      amount: Money.fromMinorUnits(record.amount, record.currency),
      status: record.status as TransferStatus,
      description: record.description,
      failureReason: record.failureReason,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    });
  }
}
