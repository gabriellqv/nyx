import { z } from 'zod';

/**
 * Environment configuration schema.
 * Enforces fail-fast validation during application bootstrap to prevent
 * runtime failures caused by missing or misconfigured infrastructure settings.
 */
export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().url(),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
    JWT_SECRET: z.string().min(32).optional(),
    WEBHOOK_SECRET_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === 'production' && !config.JWT_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET is required in production',
      });
    }
    if (config.NODE_ENV === 'production' && !config.WEBHOOK_SECRET_ENCRYPTION_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['WEBHOOK_SECRET_ENCRYPTION_KEY'],
        message: 'WEBHOOK_SECRET_ENCRYPTION_KEY is required in production',
      });
    }
  });

export type EnvironmentConfig = z.infer<typeof environmentSchema>;

/**
 * Validates process.env variables against the environment schema.
 */
export function validateEnvironment(config: Record<string, unknown>): EnvironmentConfig {
  const result = environmentSchema.safeParse(config);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map(err => `${err.path.join('.')}: ${err.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${errorDetails}`);
  }

  return result.data;
}
