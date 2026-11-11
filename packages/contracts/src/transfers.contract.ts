import { z } from 'zod';

/**
 * Schema for initiating a balance transfer between accounts.
 * Enforces UUID formats, positive integer amounts in minor currency units (cents),
 * and client-provided idempotency keys to guarantee at-most-once processing.
 */
export const createTransferSchema = z.object({
  sourceAccountId: z.string().uuid({ message: 'Source account ID must be a valid UUID' }),
  destinationAccountId: z.string().uuid({ message: 'Destination account ID must be a valid UUID' }),
  amount: z
    .number()
    .int({ message: 'Amount must be an integer representing minor units (cents)' })
    .positive({ message: 'Amount must be greater than zero' }),
  currency: z
    .string()
    .length(3, { message: 'Currency must be an ISO 4217 three-letter code' })
    .toUpperCase(),
  idempotencyKey: z
    .string()
    .min(1, { message: 'Idempotency key is required' })
    .max(128, { message: 'Idempotency key must not exceed 128 characters' }),
  description: z.string().max(255).optional(),
});
export type CreateTransferRequest = z.infer<typeof createTransferSchema>;

/**
 * Status transitions of a transfer lifecycle.
 */
export const transferStatusSchema = z.enum(['pending', 'posted', 'failed', 'reversed']);
export type TransferStatus = z.infer<typeof transferStatusSchema>;

/**
 * Transfer representation returned to API consumers.
 */
export const transferResponseSchema = z.object({
  id: z.string().uuid(),
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: transferStatusSchema,
  idempotencyKey: z.string(),
  description: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type TransferResponse = z.infer<typeof transferResponseSchema>;

/**
 * Contract schema for requesting explicit reversal of a posted transfer.
 */
export const reverseTransferSchema = z.object({
  reason: z.string().trim().min(3, { message: 'Reversal reason must be at least 3 characters' }),
  idempotencyKey: z
    .string()
    .min(1, { message: 'Idempotency key is required' })
    .max(128, { message: 'Idempotency key must not exceed 128 characters' }),
});
export type ReverseTransferRequest = z.infer<typeof reverseTransferSchema>;
