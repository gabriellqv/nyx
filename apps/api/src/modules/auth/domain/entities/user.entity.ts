import type { UserRole } from '@nyx/contracts';

/**
 * Domain entity representing an authenticated platform user.
 */
export class User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly customerId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role?: UserRole | undefined;
    customerId?: string | null | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.email = params.email.toLowerCase();
    this.passwordHash = params.passwordHash;
    this.role = params.role ?? 'user';
    this.customerId = params.customerId ?? null;
    this.createdAt = params.createdAt ?? new Date();
    this.updatedAt = params.updatedAt ?? new Date();
  }

  isAdmin(): boolean {
    return this.role === 'admin';
  }

  isAuditor(): boolean {
    return this.role === 'auditor';
  }
}
