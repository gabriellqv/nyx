import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface AuditRecordParams {
  actorId?: string | null | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string | null | undefined;
  details?: Record<string, unknown> | undefined;
}

/**
 * Service providing immutable audit logging for all critical financial state mutations.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: AuditRecordParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          id: randomUUID(),
          actorId: params.actorId ?? null,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          ipAddress: params.ipAddress ?? null,
          details: params.details ? JSON.stringify(params.details) : null,
        },
      });
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
