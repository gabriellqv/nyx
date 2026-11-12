import { z } from 'zod';

/**
 * Reconciliation operational health status.
 */
export const reconciliationStatusSchema = z.enum(['balanced', 'discrepant']);
export type ReconciliationStatus = z.infer<typeof reconciliationStatusSchema>;

/**
 * Audit result for an individual account during reconciliation.
 */
export const accountReconciliationDetailSchema = z.object({
  accountId: z.string().uuid(),
  accountNumber: z.string(),
  currency: z.string().length(3),
  accountBalance: z.number().int(),
  ledgerBalance: z.number().int(),
  discrepancy: z.number().int(),
  isBalanced: z.boolean(),
});
export type AccountReconciliationDetail = z.infer<typeof accountReconciliationDetailSchema>;

/**
 * Comprehensive reconciliation report schema.
 */
export const reconciliationReportSchema = z.object({
  id: z.string().uuid(),
  totalAccountsAudited: z.number().int(),
  balancedAccountsCount: z.number().int(),
  discrepantAccountsCount: z.number().int(),
  status: reconciliationStatusSchema,
  executedAt: z.string().datetime(),
  details: z.array(accountReconciliationDetailSchema),
});
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;

/**
 * Request parameter schema for initiating on-demand reconciliation.
 */
export const runReconciliationSchema = z.object({
  accountId: z.string().uuid().optional(),
});
export type RunReconciliationRequest = z.infer<typeof runReconciliationSchema>;
