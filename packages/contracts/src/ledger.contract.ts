import { z } from 'zod';

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
  amount: z.number().int().positive(),
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
  accountBalance: z.number().int(),
  ledgerDerivedBalance: z.number().int(),
  isReconciled: z.boolean(),
  totalDebits: z.number().int(),
  totalCredits: z.number().int(),
  discrepancy: z.number().int(),
});
export type LedgerReconciliationResponse = z.infer<typeof ledgerReconciliationResponseSchema>;
