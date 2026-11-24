import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  BadRequestException,
  Headers,
  Ip,
} from '@nestjs/common';
import {
  createPaymentSchema,
  type CreatePaymentRequest,
  type PaymentResponse,
  type PaymentPageResponse,
  type UserProfile,
} from '@nyx/contracts';
import { cursorPaginationSchema } from '@nyx/contracts';
import {
  ProcessPaymentUseCase,
  GetPaymentUseCase,
  ListPaymentsUseCase,
} from '../application/use-cases/payment.use-cases';
import { CurrentUser, Roles } from '../../auth/infrastructure/decorators/auth.decorators';
import { createAuditRequestContext } from '../../audit/audit.service';
import { CORRELATION_ID_HEADER } from '../../../common/middleware/correlation-id.middleware';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly processPaymentUseCase: ProcessPaymentUseCase,
    private readonly getPaymentUseCase: GetPaymentUseCase,
    private readonly listPaymentsUseCase: ListPaymentsUseCase,
  ) {}

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: UserProfile,
    @Ip() ipAddress: string,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<PaymentResponse> {
    const parseResult = createPaymentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.processPaymentUseCase.execute(
      parseResult.data as CreatePaymentRequest,
      createAuditRequestContext(user.id, ipAddress, correlationId),
    );
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
  ): Promise<PaymentResponse> {
    return this.getPaymentUseCase.execute(id, user);
  }

  @Get()
  async list(
    @Query('accountId') accountId: string,
    @CurrentUser() user: UserProfile,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PaymentPageResponse> {
    if (!accountId) {
      throw new BadRequestException('accountId query parameter is required');
    }
    const pagination = cursorPaginationSchema.safeParse({ limit, cursor });
    if (!pagination.success) {
      throw new BadRequestException(pagination.error.format());
    }
    return this.listPaymentsUseCase.execute(accountId, user, pagination.data);
  }
}
