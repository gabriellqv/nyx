import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { Customer, CustomerStatus } from '../../domain/entities/customer.entity';
import { ICustomerRepository } from '../../application/ports/customer.repository';

@Injectable()
export class PrismaCustomerRepository implements ICustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({ where: { email } });
    return record ? this.toDomain(record) : null;
  }

  async findByDocument(documentNumber: string): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({ where: { documentNumber } });
    return record ? this.toDomain(record) : null;
  }

  async findAll(): Promise<Customer[]> {
    const records = await this.prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map(r => this.toDomain(r));
  }

  async save(customer: Customer): Promise<Customer> {
    const record = await this.prisma.customer.upsert({
      where: { id: customer.id },
      create: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        documentNumber: customer.documentNumber,
        status: customer.status,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      update: {
        name: customer.name,
        status: customer.status,
        updatedAt: customer.updatedAt,
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    name: string;
    email: string;
    documentNumber: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): Customer {
    return new Customer({
      id: record.id,
      name: record.name,
      email: record.email,
      documentNumber: record.documentNumber,
      status: record.status as CustomerStatus,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
