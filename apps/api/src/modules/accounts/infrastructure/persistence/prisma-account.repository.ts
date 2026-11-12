import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Money } from '../../../common/domain/value-objects/money.vo';
import { Account, AccountType, AccountStatus } from '../../domain/entities/account.entity';
import { IAccountRepository } from '../../application/ports/account.repository';

@Injectable()
export class PrismaAccountRepository implements IAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Account | null> {
    const record = await this.prisma.account.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByAccountNumber(accountNumber: string): Promise<Account | null> {
    const record = await this.prisma.account.findUnique({ where: { accountNumber } });
    return record ? this.toDomain(record) : null;
  }

  async findByCustomerId(customerId: string): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(r => this.toDomain(r));
  }

  async findAll(): Promise<Account[]> {
    const records = await this.prisma.account.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map(r => this.toDomain(r));
  }

  async save(account: Account): Promise<Account> {
    const record = await this.prisma.account.upsert({
      where: { id: account.id },
      create: {
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
      update: {
        status: account.status,
        balance: account.balance.amount,
        version: account.version,
        updatedAt: account.updatedAt,
      },
    });

    return this.toDomain(record);
  }

  async updateBalance(id: string, balance: Money, version: number): Promise<boolean> {
    // Optimistic concurrency control: updates only if version matches previous version
    const result = await this.prisma.account.updateMany({
      where: {
        id,
        version: version - 1,
      },
      data: {
        balance: balance.amount,
        version,
        updatedAt: new Date(),
      },
    });

    return result.count > 0;
  }

  private toDomain(record: {
    id: string;
    customerId: string;
    accountNumber: string;
    currency: string;
    type: string;
    status: string;
    balance: bigint;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): Account {
    return new Account({
      id: record.id,
      customerId: record.customerId,
      accountNumber: record.accountNumber,
      currency: record.currency,
      type: record.type as AccountType,
      status: record.status as AccountStatus,
      balance: Money.fromCents(record.balance, record.currency),
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
