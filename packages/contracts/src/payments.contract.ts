import { z } from 'zod';
import { cursorPageResponseSchema } from './pagination.contract';
import { positiveMinorUnitInputSchema, positiveMinorUnitStringSchema } from './money.contract';

/**
 * Supported payment methods for incoming funds.
 */
export const paymentMethodSchema = z.enum(['pix', 'credit_card', 'bank_transfer']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * Status lifecycle of a payment transaction.
 */
export const paymentStatusSchema = z.enum(['pending', 'completed', 'failed']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Contract schema for creating and initiating an incoming payment.
 */
export const createPaymentSchema = z.object({
  destinationAccountId: z.string().uuid({ message: 'Destination account ID must be a valid UUID' }),
  amount: positiveMinorUnitInputSchema,
  currency: z
    .string()
    .length(3, { message: 'Currency must be an ISO 4217 three-letter code' })
    .toUpperCase(),
  method: paymentMethodSchema,
  idempotencyKey: z
    .string()
    .min(1, { message: 'Idempotency key is required' })
    .max(128, { message: 'Idempotency key must not exceed 128 characters' }),
  description: z.string().max(255).optional(),
});
export type CreatePaymentRequest = z.infer<typeof createPaymentSchema>;

/**
 * Response representation for a payment transaction.
 */
export const paymentResponseSchema = z.object({
  id: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  amount: positiveMinorUnitStringSchema,
  currency: z.string().length(3),
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  idempotencyKey: z.string(),
  description: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
});
export type PaymentResponse = z.infer<typeof paymentResponseSchema>;
export const paymentPageResponseSchema = cursorPageResponseSchema(paymentResponseSchema);
export type PaymentPageResponse = z.infer<typeof paymentPageResponseSchema>;
