import { Payment } from '../../domain/entities/payment.entity';

export const PAYMENT_REPOSITORY = Symbol('IPaymentRepository');

export interface IPaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByIdempotencyKey(key: string): Promise<Payment | null>;
  findByAccountId(accountId: string): Promise<Payment[]>;
  save(payment: Payment): Promise<Payment>;
}
