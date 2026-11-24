import { Payment } from '../../domain/entities/payment.entity';
import type { CursorPage } from '@nyx/contracts';
import type { CursorPagination } from '../../../common/application/cursor-pagination';

export const PAYMENT_REPOSITORY = Symbol('IPaymentRepository');

export interface IPaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByIdempotencyKey(key: string): Promise<Payment | null>;
  findByAccountId(accountId: string, pagination: CursorPagination): Promise<CursorPage<Payment>>;
  save(payment: Payment): Promise<Payment>;
}
