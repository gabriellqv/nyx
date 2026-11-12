export type CustomerStatus = 'active' | 'suspended' | 'closed';

/**
 * Domain entity representing an individual or business client.
 */
export class Customer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly documentNumber: string;
  private currentStatus: CustomerStatus;
  readonly createdAt: Date;
  private lastUpdatedAt: Date;

  constructor(params: {
    id: string;
    name: string;
    email: string;
    documentNumber: string;
    status?: CustomerStatus | undefined;
    createdAt?: Date | undefined;
    updatedAt?: Date | undefined;
  }) {
    this.id = params.id;
    this.name = params.name;
    this.email = params.email;
    this.documentNumber = params.documentNumber;
    this.currentStatus = params.status ?? 'active';
    this.createdAt = params.createdAt ?? new Date();
    this.lastUpdatedAt = params.updatedAt ?? new Date();
  }

  get status(): CustomerStatus {
    return this.currentStatus;
  }

  get updatedAt(): Date {
    return this.lastUpdatedAt;
  }

  isActive(): boolean {
    return this.currentStatus === 'active';
  }

  suspend(): void {
    this.currentStatus = 'suspended';
    this.lastUpdatedAt = new Date();
  }

  activate(): void {
    this.currentStatus = 'active';
    this.lastUpdatedAt = new Date();
  }
}
