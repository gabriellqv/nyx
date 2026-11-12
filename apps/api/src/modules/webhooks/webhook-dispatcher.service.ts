import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OutboxService, OutboxRecord } from '../outbox/outbox.service';

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
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: {
        status: 'active',
        OR: [{ events: { has: event.eventType } }, { events: { has: '*' } }],
      },
    });

    if (endpoints.length === 0) {
      this.logger.debug(`No webhook subscribers found for event ${event.eventType}`);
      await this.outboxService.markPublished(event.id);
      return [];
    }

    const results: DispatchResult[] = [];
    let hasFailure = false;

    for (const endpoint of endpoints) {
      const deliveryId = randomUUID();
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = this.signPayload(event.payload, endpoint.secret, timestamp);
      const startTime = Date.now();

      let statusCode: number | null = null;
      let responseBody: string | null;
      let status: 'success' | 'failed';

      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Nyx-Signature': `t=${timestamp},v1=${signature}`,
            'X-Nyx-Event': event.eventType,
            'X-Nyx-Delivery': deliveryId,
            'X-Nyx-Timestamp': String(timestamp),
          },
          body: event.payload,
          signal: AbortSignal.timeout(5000),
        });

        statusCode = response.status;
        const text = await response.text();
        responseBody = text.slice(0, 500);
        status = response.ok ? 'success' : 'failed';
      } catch (error) {
        status = 'failed';
        responseBody = error instanceof Error ? error.message : String(error);
      }

      const durationMs = Date.now() - startTime;

      await this.prisma.webhookDelivery.create({
        data: {
          id: deliveryId,
          endpointId: endpoint.id,
          outboxEventId: event.id,
          statusCode,
          status,
          attempts: 1,
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
        `One or more webhook deliveries failed for event ${event.id}`,
      );
    } else {
      await this.outboxService.markPublished(event.id);
    }

    return results;
  }

  /**
   * Processes all currently pending outbox events and dispatches them to webhooks.
   */
  async dispatchPending(): Promise<{ processedCount: number; results: DispatchResult[] }> {
    const pendingEvents = await this.outboxService.fetchPending(50);
    const allResults: DispatchResult[] = [];

    for (const event of pendingEvents) {
      const results = await this.dispatchEvent(event);
      allResults.push(...results);
    }

    return {
      processedCount: pendingEvents.length,
      results: allResults,
    };
  }
}
