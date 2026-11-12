import { z } from 'zod';

/**
 * Supported outbound webhook notification event types.
 */
export const webhookEventTypeSchema = z.enum([
  '*',
  'transfer.posted',
  'transfer.reversed',
  'payment.completed',
  'account.created',
]);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

/**
 * Status of a registered webhook endpoint.
 */
export const webhookEndpointStatusSchema = z.enum(['active', 'disabled']);
export type WebhookEndpointStatus = z.infer<typeof webhookEndpointStatusSchema>;

/**
 * Contract schema for registering a new webhook subscriber endpoint.
 */
export const registerWebhookEndpointSchema = z.object({
  url: z.string().url({ message: 'Must provide a valid HTTP or HTTPS URL' }),
  secret: z
    .string()
    .min(16, { message: 'Webhook signing secret must be at least 16 characters' })
    .max(128, { message: 'Webhook signing secret must not exceed 128 characters' })
    .optional(),
  events: z
    .array(webhookEventTypeSchema)
    .min(1, { message: 'At least one event type must be selected' }),
  description: z.string().max(255).optional(),
});
export type RegisterWebhookEndpointRequest = z.infer<typeof registerWebhookEndpointSchema>;

/**
 * Response schema representing a registered webhook subscriber.
 */
export const webhookEndpointResponseSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  events: z.array(z.string()),
  status: webhookEndpointStatusSchema,
  description: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WebhookEndpointResponse = z.infer<typeof webhookEndpointResponseSchema>;

/**
 * Status of a webhook dispatch attempt.
 */
export const webhookDeliveryStatusSchema = z.enum(['pending', 'success', 'failed']);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

/**
 * Response schema representing a recorded webhook delivery attempt.
 */
export const webhookDeliveryResponseSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string().uuid(),
  outboxEventId: z.string().uuid(),
  statusCode: z.number().int().nullable().optional(),
  status: webhookDeliveryStatusSchema,
  attempts: z.number().int(),
  durationMs: z.number().int().nullable().optional(),
  responseBody: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type WebhookDeliveryResponse = z.infer<typeof webhookDeliveryResponseSchema>;
