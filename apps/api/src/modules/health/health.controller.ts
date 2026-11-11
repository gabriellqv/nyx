import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse } from '@nyx/contracts';
import { HealthService } from './health.service';

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
  @HttpCode(HttpStatus.OK)
  async getHealth(): Promise<HealthResponse> {
    return this.healthService.checkHealth();
  }

  /**
   * Readiness probe for load balancers and orchestrators.
   */
  @Get('ready')
  async getReadiness(@Res() res: Response): Promise<Response> {
    const health = await this.healthService.checkHealth();
    const isReady = health.status === 'ok';

    return res.status(isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json(health);
  }
}
