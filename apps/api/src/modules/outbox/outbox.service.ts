import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface CreateOutboxEventParams {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface OutboxRecord {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date;
  errorMessage: string | null;
  createdAt: Date;
  processedAt: Date | null;
  lockedAt: Date | null;
  lockedBy: string | null;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atomically records an outbox event.
   * Can accept a Prisma transaction client so the event is committed
   * in the exact same ACID transaction as the business operation.
   */
  async recordEvent(
    params: CreateOutboxEventParams,
    tx?: Prisma.TransactionClient,
  ): Promise<OutboxRecord> {
    const client = tx ?? this.prisma;

    const event = await client.outboxEvent.create({
      data: {
        id: randomUUID(),
        eventType: params.eventType,
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        payload: JSON.stringify(params.payload),
        status: 'pending',
        retryCount: 0,
        maxRetries: 5,
        nextRetryAt: new Date(),
      },
    });

    this.logger.debug(
      `Outbox event created: [${params.eventType}] for ${params.aggregateType}:${params.aggregateId}`,
    );

    return event;
  }

  /**
   * Fetches pending events eligible for dispatching.
   */
  async claimPending(
    limit = 50,
    workerId = randomUUID(),
    leaseMilliseconds = 120_000,
  ): Promise<OutboxRecord[]> {
    const now = new Date();
    const expiredBefore = new Date(now.getTime() - leaseMilliseconds);

    return this.prisma.$queryRaw<OutboxRecord[]>`
      WITH eligible AS (
        SELECT id
        FROM outbox_events
        WHERE (status = 'pending' AND next_retry_at <= ${now})
           OR (status = 'processing' AND locked_at <= ${expiredBefore})
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE outbox_events AS event
      SET status = 'processing', locked_at = ${now}, locked_by = ${workerId}
      FROM eligible
      WHERE event.id = eligible.id
      RETURNING
        event.id,
        event.event_type AS "eventType",
        event.aggregate_type AS "aggregateType",
        event.aggregate_id AS "aggregateId",
        event.payload,
        event.status,
        event.retry_count AS "retryCount",
        event.max_retries AS "maxRetries",
        event.next_retry_at AS "nextRetryAt",
        event.error_message AS "errorMessage",
        event.created_at AS "createdAt",
        event.processed_at AS "processedAt",
        event.locked_at AS "lockedAt",
        event.locked_by AS "lockedBy"
    `;
  }

  /**
   * Extends the lease held by a dispatcher while it sends webhooks.
   */
  async extendLease(id: string, workerId: string): Promise<boolean> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id, status: 'processing', lockedBy: workerId },
      data: {
        lockedAt: new Date(),
      },
    });
    return result.count === 1;
  }

  /**
   * Marks an event published only if this dispatcher still owns its lease.
   */
  async markPublished(id: string, workerId: string): Promise<boolean> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id, status: 'processing', lockedBy: workerId },
      data: {
        status: 'published',
        processedAt: new Date(),
        errorMessage: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
    return result.count === 1;
  }

  /**
   * Marks an outbox event as failed, scheduling exponential backoff retry.
   */
  async markFailed(id: string, workerId: string, errorMessage: string): Promise<boolean> {
    return this.prisma.$transaction(async tx => {
      const event = await tx.outboxEvent.findFirst({
        where: { id, status: 'processing', lockedBy: workerId },
      });
      if (!event) return false;

      const nextRetryCount = event.retryCount + 1;
      const isExhausted = nextRetryCount >= event.maxRetries;
      const backoffSeconds = Math.min(Math.pow(2, nextRetryCount), 60);
      const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);

      await tx.outboxEvent.update({
        where: { id },
        data: {
          status: isExhausted ? 'failed' : 'pending',
          retryCount: nextRetryCount,
          nextRetryAt,
          errorMessage,
          lockedAt: null,
          lockedBy: null,
        },
      });

      this.logger.warn(
        `Outbox event ${id} delivery failed (attempt ${nextRetryCount}/${event.maxRetries}): ${errorMessage}`,
      );
      return true;
    });
  }
}
