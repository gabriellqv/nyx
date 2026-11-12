import { Injectable } from '@nestjs/common';
import type { UserRole } from '@nyx/contracts';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { User } from '../../domain/entities/user.entity';
import { IUserRepository } from '../../application/ports/user.repository';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return record ? this.toDomain(record) : null;
  }

  async save(user: User): Promise<User> {
    const record = await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        customerId: user.customerId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      update: {
        name: user.name,
        passwordHash: user.passwordHash,
        role: user.role,
        customerId: user.customerId,
        updatedAt: user.updatedAt,
      },
    });

    return this.toDomain(record);
  }

  private toDomain(record: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: string;
    customerId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return new User({
      id: record.id,
      name: record.name,
      email: record.email,
      passwordHash: record.passwordHash,
      role: record.role as UserRole,
      customerId: record.customerId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
