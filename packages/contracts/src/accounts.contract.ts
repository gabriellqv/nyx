import { z } from 'zod';
import { cursorPageResponseSchema } from './pagination.contract';
import {
  minorUnitInputSchema,
  nonNegativeMinorUnitStringSchema,
  positiveMinorUnitInputSchema,
} from './money.contract';

/**
 * Account category classification.
 */
export const accountTypeSchema = z.enum(['checking', 'savings', 'internal']);
export type AccountType = z.infer<typeof accountTypeSchema>;

/**
 * Operational state of a financial account.
 */
export const accountStatusSchema = z.enum(['active', 'frozen', 'closed']);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

/**
 * Contract schema for provisioning a new financial account.
 */
export const createAccountSchema = z.object({
  customerId: z.string().uuid({ message: 'Customer ID must be a valid UUID' }),
  currency: z
    .string()
    .length(3, { message: 'Currency must be an ISO 4217 three-letter code' })
    .toUpperCase(),
  type: accountTypeSchema.default('checking'),
  initialDeposit: minorUnitInputSchema.default('0'),
});
export type CreateAccountRequest = z.infer<typeof createAccountSchema>;

/**
 * Account representation returned by API endpoints.
 * Balances are decimal strings containing integer minor currency units.
 */
export const accountResponseSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  accountNumber: z.string(),
  currency: z.string().length(3),
  type: accountTypeSchema,
  status: accountStatusSchema,
  balance: nonNegativeMinorUnitStringSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AccountResponse = z.infer<typeof accountResponseSchema>;
export const accountPageResponseSchema = cursorPageResponseSchema(accountResponseSchema);
export type AccountPageResponse = z.infer<typeof accountPageResponseSchema>;

/**
 * Contract schema for loading initial funds or manual balance adjustments.
 */
export const depositRequestSchema = z.object({
  amount: positiveMinorUnitInputSchema,
  idempotencyKey: z
    .string()
    .min(1, { message: 'Idempotency key is required' })
    .max(128, { message: 'Idempotency key cannot exceed 128 characters' }),
  description: z.string().max(255).optional(),
});
export type DepositRequest = z.infer<typeof depositRequestSchema>;
