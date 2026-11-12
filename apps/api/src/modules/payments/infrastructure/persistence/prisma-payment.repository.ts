import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Payment } from '../../domain/entities/payment.entity';
import { IPaymentRepository } from '../../application/ports/payment.repository';
import { Money } from '../../../common/domain/value-objects/money.vo';
import type { PaymentMethod, PaymentStatus } from '@nyx/contracts';

@Injectable()
export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Payment | null> {
    const raw = await this.prisma.payment.findUnique({ where: { id } });
    return raw ? this.toDomain(raw) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Payment | null> {
    const raw = await this.prisma.payment.findUnique({ where: { idempotencyKey: key } });
    return raw ? this.toDomain(raw) : null;
  }

  async findByAccountId(accountId: string): Promise<Payment[]> {
    const raw = await this.prisma.payment.findMany({
      where: { destinationAccountId: accountId },
      orderBy: { createdAt: 'desc' },
    });
    return raw.map(r => this.toDomain(r));
  }

  async save(payment: Payment): Promise<Payment> {
    const raw = await this.prisma.payment.upsert({
      where: { id: payment.id },
      create: {
        id: payment.id,
        idempotencyKey: payment.idempotencyKey,
        destinationAccountId: payment.destinationAccountId,
        amount: payment.amount.amount,
        currency: payment.amount.currency,
        method: payment.method,
        status: payment.status,
        description: payment.description,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt,
      },
      update: {
        status: payment.status,
        completedAt: payment.completedAt,
      },
    });

    return this.toDomain(raw);
  }

  private toDomain(raw: {
    id: string;
    idempotencyKey: string;
    destinationAccountId: string;
    amount: bigint;
    currency: string;
    method: string;
    status: string;
    description: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }): Payment {
    return new Payment({
      id: raw.id,
      idempotencyKey: raw.idempotencyKey,
      destinationAccountId: raw.destinationAccountId,
      amount: Money.fromCents(raw.amount, raw.currency),
      method: raw.method as PaymentMethod,
      status: raw.status as PaymentStatus,
      description: raw.description,
      createdAt: raw.createdAt,
      completedAt: raw.completedAt,
    });
  }
}
