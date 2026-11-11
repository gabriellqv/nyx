import { z } from 'zod';

/**
 * Customer status lifecycle enum.
 */
export const customerStatusSchema = z.enum(['active', 'suspended', 'closed']);
export type CustomerStatus = z.infer<typeof customerStatusSchema>;

/**
 * Contract schema for creating a new customer profile.
 */
export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, { message: 'Customer name must be at least 2 characters' }),
  email: z.string().trim().email({ message: 'Must provide a valid email address' }),
  documentNumber: z
    .string()
    .trim()
    .min(5, { message: 'Document number must be at least 5 characters' })
    .max(32, { message: 'Document number cannot exceed 32 characters' }),
});
export type CreateCustomerRequest = z.infer<typeof createCustomerSchema>;

/**
 * Customer representation returned by API endpoints.
 */
export const customerResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  documentNumber: z.string(),
  status: customerStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CustomerResponse = z.infer<typeof customerResponseSchema>;
