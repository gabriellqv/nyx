import { Money } from '../../../common/domain/value-objects/money.vo';

export type TransferStatus = 'pending' | 'posted' | 'failed' | 'reversed';

/**
 * Domain entity representing an atomic balance transfer instruction between accounts.
 */
export class Transfer {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly sourceAccountId: string;
  readonly destinationAccountId: string;
  readonly amount: Money;
  private currentStatus: TransferStatus;
  readonly description: string | null;
  private currentFailureReason: string | null;
  readonly createdAt: Date;
  private currentCompletedAt: Date | null;

  constructor(params: {
    id: string;
    idempotencyKey: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amount: Money;
    status?: TransferStatus | undefined;
    description?: string | null | undefined;
    failureReason?: string | null | undefined;
    createdAt?: Date | undefined;
    completedAt?: Date | null | undefined;
  }) {
    this.id = params.id;
    this.idempotencyKey = params.idempotencyKey;
    this.sourceAccountId = params.sourceAccountId;
    this.destinationAccountId = params.destinationAccountId;
    this.amount = params.amount;
    this.currentStatus = params.status ?? 'pending';
    this.description = params.description ?? null;
    this.currentFailureReason = params.failureReason ?? null;
    this.createdAt = params.createdAt ?? new Date();
    this.currentCompletedAt = params.completedAt ?? null;
  }

  get status(): TransferStatus {
    return this.currentStatus;
  }

  get failureReason(): string | null {
    return this.currentFailureReason;
  }

  get completedAt(): Date | null {
    return this.currentCompletedAt;
  }

  markAsPosted(): void {
    this.currentStatus = 'posted';
    this.currentCompletedAt = new Date();
  }

  markAsFailed(reason: string): void {
    this.currentStatus = 'failed';
    this.currentFailureReason = reason;
    this.currentCompletedAt = new Date();
  }

  markAsReversed(): void {
    this.currentStatus = 'reversed';
    this.currentCompletedAt = new Date();
  }
}
