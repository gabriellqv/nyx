import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@nyx/contracts';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Service coordinating application and infrastructure health status evaluations.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Evaluates system status and database reachability.
   */
  async checkHealth(): Promise<HealthResponse> {
    const isDbConnected = await this.prismaService.ping();

    return {
      status: isDbConnected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: isDbConnected ? 'ok' : 'error',
      version: '0.1.0',
    };
  }
}
