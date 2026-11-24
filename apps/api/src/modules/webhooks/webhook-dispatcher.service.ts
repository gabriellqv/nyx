import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OutboxService, OutboxRecord } from '../outbox/outbox.service';
import { postWebhookRequest, resolveWebhookTarget } from './webhook-target';
import { decryptWebhookSecret } from './webhook-secret';

export interface DispatchResult {
  endpointId: string;
  deliveryId: string;
  statusCode: number | null;
  status: 'success' | 'failed';
  durationMs: number;
  error?: string | undefined;
}

@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Generates a cryptographic HMAC-SHA256 signature for payload verification.
   */
  signPayload(payload: string, secret: string, timestamp: number): string {
    const signaturePayload = `${timestamp}.${payload}`;
    return createHmac('sha256', secret).update(signaturePayload).digest('hex');
  }

  /**
   * Dispatches a single outbox event to all matching webhook subscriber endpoints.
   */
  async dispatchEvent(event: OutboxRecord): Promise<DispatchResult[]> {
    const workerId = event.lockedBy;
    if (!workerId) {
      return [];
    }

    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        status: 'active',
        OR: [{ events: { has: event.eventType } }, { events: { has: '*' } }],
      },
    });

    if (endpoints.length === 0) {
      this.logger.debug(`No webhook subscribers found for event ${event.eventType}`);
      await this.outboxService.markPublished(event.id, workerId);
      return [];
    }

    const results: DispatchResult[] = [];
    let hasFailure = false;

    for (const endpoint of endpoints) {
      const existingDelivery = await this.prisma.webhookDelivery.findUnique({
        where: {
          endpointId_outboxEventId: {
            endpointId: endpoint.id,
            outboxEventId: event.id,
          },
        },
      });
      if (existingDelivery?.status === 'success') {
        continue;
      }

      if (!(await this.outboxService.extendLease(event.id, workerId))) {
        return results;
      }

      const delivery = await this.prisma.webhookDelivery.upsert({
        where: {
          endpointId_outboxEventId: {
            endpointId: endpoint.id,
            outboxEventId: event.id,
          },
        },
        create: {
          id: randomUUID(),
          endpointId: endpoint.id,
          outboxEventId: event.id,
          status: 'processing',
          attempts: 1,
        },
        update: {
          status: 'processing',
          attempts: { increment: 1 },
          statusCode: null,
          durationMs: null,
          responseBody: null,
        },
      });

      const deliveryId = delivery.id;
      const timestamp = Math.floor(Date.now() / 1000);
      const startTime = Date.now();

      let statusCode: number | null = null;
      let responseBody: string | null;
      let status: 'success' | 'failed';

      try {
        const signature = this.signPayload(
          event.payload,
          decryptWebhookSecret(endpoint.secret),
          timestamp,
        );
        const target = await resolveWebhookTarget(endpoint.url);
        const response = await postWebhookRequest(
          target,
          {
            'Content-Type': 'application/json',
            'X-Nyx-Signature': `t=${timestamp},v1=${signature}`,
            'X-Nyx-Event': event.eventType,
            'X-Nyx-Delivery': deliveryId,
            'X-Nyx-Timestamp': String(timestamp),
          },
          event.payload,
        );

        statusCode = response.statusCode;
        responseBody = response.body.slice(0, 500);
        status = response.statusCode >= 200 && response.statusCode < 300 ? 'success' : 'failed';
      } catch (error) {
        status = 'failed';
        responseBody = error instanceof Error ? error.message : String(error);
      }

      const durationMs = Date.now() - startTime;

      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          statusCode,
          status,
          durationMs,
          responseBody,
        },
      });

      results.push({
        endpointId: endpoint.id,
        deliveryId,
        statusCode,
        status,
        durationMs,
        error: status === 'failed' ? (responseBody ?? undefined) : undefined,
      });

      if (status === 'failed') {
        hasFailure = true;
      }
    }

    if (hasFailure) {
      await this.outboxService.markFailed(
        event.id,
        workerId,
        `One or more webhook deliveries failed for event ${event.id}`,
      );
    } else {
      await this.outboxService.markPublished(event.id, workerId);
    }

    return results;
  }

  /**
   * Processes all currently pending outbox events and dispatches them to webhooks.
   */
  async dispatchPending(): Promise<{ processedCount: number; results: DispatchResult[] }> {
    const workerId = randomUUID();
    const pendingEvents = await this.outboxService.claimPending(50, workerId);
    const allResults: DispatchResult[] = [];

    for (const event of pendingEvents) {
      try {
        const results = await this.dispatchEvent(event);
        allResults.push(...results);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.outboxService.markFailed(event.id, workerId, message);
        this.logger.error(`Outbox event ${event.id} dispatch failed`, message);
      }
    }

    return {
      processedCount: pendingEvents.length,
      results: allResults,
    };
  }
}
