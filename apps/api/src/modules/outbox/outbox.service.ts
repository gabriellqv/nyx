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
  async fetchPending(limit = 50): Promise<OutboxRecord[]> {
    const now = new Date();
    return this.prisma.outboxEvent.findMany({
      where: {
        status: 'pending',
        nextRetryAt: { lte: now },
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Marks an outbox event as successfully processed and published.
   */
  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'published',
        processedAt: new Date(),
        errorMessage: null,
      },
    });
  }

  /**
   * Marks an outbox event as failed, scheduling exponential backoff retry.
   */
  async markFailed(id: string, errorMessage: string): Promise<void> {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id } });
    if (!event) return;

    const nextRetryCount = event.retryCount + 1;
    const isExhausted = nextRetryCount >= event.maxRetries;

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const backoffSeconds = Math.min(Math.pow(2, nextRetryCount), 60);
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);

    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: isExhausted ? 'failed' : 'pending',
        retryCount: nextRetryCount,
        nextRetryAt,
        errorMessage,
      },
    });

    this.logger.warn(
      `Outbox event ${id} delivery failed (attempt ${nextRetryCount}/${event.maxRetries}): ${errorMessage}`,
    );
  }
}
