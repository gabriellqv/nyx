import { z } from 'zod';
import {
  positiveMinorUnitStringSchema,
  nonNegativeMinorUnitStringSchema,
  signedMinorUnitStringSchema,
} from './money.contract';

/**
 * Entry type classification in double-entry bookkeeping.
 */
export const ledgerEntryTypeSchema = z.enum(['debit', 'credit']);
export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

/**
 * Business event originating the ledger posting.
 */
export const ledgerReferenceTypeSchema = z.enum([
  'transfer',
  'deposit',
  'payment',
  'reversal',
  'adjustment',
]);
export type LedgerReferenceType = z.infer<typeof ledgerReferenceTypeSchema>;

/**
 * Immutable ledger entry recording a debit or credit posting.
 */
export const ledgerEntryResponseSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  ledgerAccountId: z.string().uuid().nullable().optional(),
  entryType: ledgerEntryTypeSchema,
  amount: positiveMinorUnitStringSchema,
  currency: z.string().length(3),
  sequenceNumber: z.number().int(),
  createdAt: z.string().datetime(),
});
export type LedgerEntryResponse = z.infer<typeof ledgerEntryResponseSchema>;

/**
 * Ledger transaction grouping balanced debit and credit entries.
 */
export const ledgerTransactionResponseSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  referenceType: ledgerReferenceTypeSchema,
  referenceId: z.string().nullable(),
  createdAt: z.string().datetime(),
  entries: z.array(ledgerEntryResponseSchema),
});
export type LedgerTransactionResponse = z.infer<typeof ledgerTransactionResponseSchema>;

/**
 * Reconciliation evaluation verifying account balance against immutable ledger postings.
 */
export const ledgerReconciliationResponseSchema = z.object({
  accountId: z.string().uuid(),
  accountBalance: nonNegativeMinorUnitStringSchema,
  ledgerDerivedBalance: signedMinorUnitStringSchema,
  isReconciled: z.boolean(),
  totalDebits: nonNegativeMinorUnitStringSchema,
  totalCredits: nonNegativeMinorUnitStringSchema,
  discrepancy: signedMinorUnitStringSchema,
});
export type LedgerReconciliationResponse = z.infer<typeof ledgerReconciliationResponseSchema>;
