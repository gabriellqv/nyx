import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpStatus,
  HttpCode,
  Headers,
  Ip,
} from '@nestjs/common';
import {
  runReconciliationSchema,
  type RunReconciliationRequest,
  type ReconciliationReport,
} from '@nyx/contracts';
import { ReconciliationService } from '../reconciliation.service';
import { Roles } from '../../auth/infrastructure/decorators/auth.decorators';
import { CurrentUser } from '../../auth/infrastructure/decorators/auth.decorators';
import type { UserProfile } from '@nyx/contracts';
import { createAuditRequestContext } from '../../audit/audit.service';
import { CORRELATION_ID_HEADER } from '../../../common/middleware/correlation-id.middleware';

@Controller('reconciliation')
@Roles('admin', 'auditor')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async run(
    @Body() body: unknown,
    @CurrentUser() user: UserProfile,
    @Ip() ipAddress: string,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<ReconciliationReport> {
    const parseResult = runReconciliationSchema.safeParse(body);
    const dto = parseResult.success ? (parseResult.data as RunReconciliationRequest) : undefined;
    return this.reconciliationService.runReconciliation(
      dto,
      createAuditRequestContext(user.id, ipAddress, correlationId),
    );
  }

  @Get('history')
  async getHistory(@Query('limit') limit?: string): Promise<ReconciliationReport[]> {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;
    return this.reconciliationService.getHistory(parsedLimit);
  }
}
