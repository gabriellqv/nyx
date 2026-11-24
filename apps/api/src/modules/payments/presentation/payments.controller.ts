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
} from '@nestjs/common';
import {
  createPaymentSchema,
  type CreatePaymentRequest,
  type PaymentResponse,
  type UserProfile,
} from '@nyx/contracts';
import {
  ProcessPaymentUseCase,
  GetPaymentUseCase,
  ListPaymentsUseCase,
} from '../application/use-cases/payment.use-cases';
import { CurrentUser, Roles } from '../../auth/infrastructure/decorators/auth.decorators';

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
  async create(@Body() body: unknown): Promise<PaymentResponse> {
    const parseResult = createPaymentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.processPaymentUseCase.execute(parseResult.data as CreatePaymentRequest);
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
  ): Promise<PaymentResponse[]> {
    if (!accountId) {
      throw new BadRequestException('accountId query parameter is required');
    }
    return this.listPaymentsUseCase.execute(accountId, user);
  }
}
