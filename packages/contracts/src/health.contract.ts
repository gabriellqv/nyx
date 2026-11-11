import { z } from 'zod';

/**
 * System health status representation.
 */
export const healthStatusSchema = z.enum(['ok', 'error', 'degraded']);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

/**
 * Healthcheck response contract.
 * Communicates application status, database connectivity, and timestamp.
 */
export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  timestamp: z.string().datetime(),
  database: healthStatusSchema,
  version: z.string().min(1),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
