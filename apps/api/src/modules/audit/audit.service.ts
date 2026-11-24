import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface AuditRecordParams {
  actorId?: string | null | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string | null | undefined;
  correlationId?: string | null | undefined;
  details?: Record<string, unknown> | undefined;
}

export type AuditRequestContext = Pick<
  AuditRecordParams,
  'actorId' | 'ipAddress' | 'correlationId'
>;

export function createAuditRequestContext(
  actorId: string,
  ipAddress?: string,
  correlationId?: string,
): AuditRequestContext {
  return {
    actorId,
    ipAddress: ipAddress ?? null,
    correlationId: correlationId ?? null,
  };
}

/**
 * Service providing immutable audit logging for all critical financial state mutations.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: AuditRecordParams, tx?: Prisma.TransactionClient): Promise<void> {
    const data = {
      id: randomUUID(),
      actorId: params.actorId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      ipAddress: params.ipAddress ?? null,
      correlationId: params.correlationId ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
    };

    if (tx) {
      await tx.auditLog.create({ data });
      return;
    }

    try {
      await this.prisma.auditLog.create({ data });
      this.logger.log(
        `Audit recorded: [${params.action}] on ${params.resourceType} ${params.resourceId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to persist audit log for ${params.action}`, error);
    }
  }

  async findByResource(resourceType: string, resourceId: string) {
    return this.prisma.auditLog.findMany({
      where: { resourceType, resourceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(limit = 50) {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}
