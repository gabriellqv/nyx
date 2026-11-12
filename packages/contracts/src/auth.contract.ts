import { z } from 'zod';

/**
 * Access control roles within the system.
 */
export const userRoleSchema = z.enum(['user', 'admin', 'auditor']);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Contract schema for user credential registration.
 */
export const registerUserSchema = z.object({
  name: z.string().trim().min(2, { message: 'Name must be at least 2 characters' }),
  email: z.string().trim().email({ message: 'Must provide a valid email address' }),
  password: z
    .string()
    .min(8, { message: 'Password must be at least 8 characters long' })
    .max(128, { message: 'Password cannot exceed 128 characters' }),
  role: userRoleSchema.default('user'),
  customerId: z.string().uuid().optional(),
});
export type RegisterUserRequest = z.infer<typeof registerUserSchema>;

/**
 * Contract schema for user credential authentication.
 */
export const loginSchema = z.object({
  email: z.string().trim().email({ message: 'Must provide a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});
export type LoginRequest = z.infer<typeof loginSchema>;

/**
 * Authenticated user profile representation.
 */
export const userProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: userRoleSchema,
  customerId: z.string().uuid().nullable(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * Authentication response payload returning JWT token and profile.
 */
export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userProfileSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
