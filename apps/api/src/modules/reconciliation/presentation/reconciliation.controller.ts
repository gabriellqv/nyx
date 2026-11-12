import { Controller, Post, Get, Body, Query, HttpStatus, HttpCode } from '@nestjs/common';
import {
  runReconciliationSchema,
  type RunReconciliationRequest,
  type ReconciliationReport,
} from '@nyx/contracts';
import { ReconciliationService } from '../reconciliation.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(@Body() body: unknown): Promise<ReconciliationReport> {
    const parseResult = runReconciliationSchema.safeParse(body);
    const dto = parseResult.success ? (parseResult.data as RunReconciliationRequest) : undefined;
    return this.reconciliationService.runReconciliation(dto);
  }

  @Get('history')
  async getHistory(@Query('limit') limit?: string): Promise<ReconciliationReport[]> {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;
    return this.reconciliationService.getHistory(parsedLimit);
  }
}
