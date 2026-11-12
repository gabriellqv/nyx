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
} from '@nyx/contracts';
import {
  ProcessPaymentUseCase,
  GetPaymentUseCase,
  ListPaymentsUseCase,
} from '../application/use-cases/payment.use-cases';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly processPaymentUseCase: ProcessPaymentUseCase,
    private readonly getPaymentUseCase: GetPaymentUseCase,
    private readonly listPaymentsUseCase: ListPaymentsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<PaymentResponse> {
    const parseResult = createPaymentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.processPaymentUseCase.execute(parseResult.data as CreatePaymentRequest);
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<PaymentResponse> {
    return this.getPaymentUseCase.execute(id);
  }

  @Get()
  async list(@Query('accountId') accountId: string): Promise<PaymentResponse[]> {
    if (!accountId) {
      throw new BadRequestException('accountId query parameter is required');
    }
    return this.listPaymentsUseCase.execute(accountId);
  }
}
