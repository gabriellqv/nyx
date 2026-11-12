import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { Transfer, TransferStatus } from '../../domain/entities/transfer.entity';
import { ITransferRepository } from '../../application/ports/transfer.repository';

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

  async findAll(filters?: {
    accountId?: string | undefined;
    status?: string | undefined;
  }): Promise<Transfer[]> {
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

    const records = await this.prisma.transfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map(r => this.toDomain(r));
  }

  async save(transfer: Transfer): Promise<Transfer> {
    const record = await this.prisma.transfer.upsert({
      where: { id: transfer.id },
      create: {
        id: transfer.id,
        idempotencyKey: transfer.idempotencyKey,
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
      sourceAccountId: record.sourceAccountId,
      destinationAccountId: record.destinationAccountId,
      amount: Money.fromCents(record.amount, record.currency),
      status: record.status as TransferStatus,
      description: record.description,
      failureReason: record.failureReason,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
    });
  }
}
