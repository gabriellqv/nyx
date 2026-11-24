import { Money } from '../../../common/domain/value-objects/money.vo';
import type { PaymentMethod, PaymentStatus } from '@nyx/contracts';

export interface PaymentProps {
  id: string;
  idempotencyKey: string;
  requestHash?: string | null | undefined;
  destinationAccountId: string;
  amount: Money;
  method: PaymentMethod;
  status?: PaymentStatus | undefined;
  description?: string | null | undefined;
  createdAt?: Date | undefined;
  completedAt?: Date | null | undefined;
}

export class Payment {
  private readonly _id: string;
  private readonly _idempotencyKey: string;
  private readonly _requestHash: string | null;
  private readonly _destinationAccountId: string;
  private readonly _amount: Money;
  private readonly _method: PaymentMethod;
  private _status: PaymentStatus;
  private readonly _description: string | null;
  private readonly _createdAt: Date;
  private _completedAt: Date | null;

  constructor(props: PaymentProps) {
    this._id = props.id;
    this._idempotencyKey = props.idempotencyKey;
    this._requestHash = props.requestHash ?? null;
    this._destinationAccountId = props.destinationAccountId;
    this._amount = props.amount;
    this._method = props.method;
    this._status = props.status ?? 'pending';
    this._description = props.description ?? null;
    this._createdAt = props.createdAt ?? new Date();
    this._completedAt = props.completedAt ?? null;
  }

  get id(): string {
    return this._id;
  }

  get idempotencyKey(): string {
    return this._idempotencyKey;
  }

  get requestHash(): string | null {
    return this._requestHash;
  }

  get destinationAccountId(): string {
    return this._destinationAccountId;
  }

  get amount(): Money {
    return this._amount;
  }

  get method(): PaymentMethod {
    return this._method;
  }

  get status(): PaymentStatus {
    return this._status;
  }

  get description(): string | null {
    return this._description;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get completedAt(): Date | null {
    return this._completedAt;
  }

  markCompleted(): void {
    this._status = 'completed';
    this._completedAt = new Date();
  }

  markFailed(): void {
    this._status = 'failed';
    this._completedAt = new Date();
  }
}
