import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse } from '@nyx/contracts';
import { HealthService } from './health.service';
import { Public } from '../auth/infrastructure/decorators/auth.decorators';

/**
 * Controller exposing operational health probe endpoints.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Health probe endpoint returning operational state.
   */
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  async getHealth(): Promise<HealthResponse> {
    return this.healthService.checkHealth();
  }

  /**
   * Liveness probe verifying the node process is active and responsive.
   */
  @Get('live')
  @Public()
  @HttpCode(HttpStatus.OK)
  getLiveness(): { status: string; uptime: number } {
    return { status: 'ok', uptime: process.uptime() };
  }

  /**
   * Readiness probe for load balancers and orchestrators.
   */
  @Get('ready')
  @Public()
  async getReadiness(@Res() res: Response): Promise<Response> {
    const health = await this.healthService.checkHealth();
    const isReady = health.status === 'ok';

    return res.status(isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(health);
  }
}
