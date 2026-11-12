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
  UseGuards,
} from '@nestjs/common';
import {
  createTransferSchema,
  reverseTransferSchema,
  type CreateTransferRequest,
  type ReverseTransferRequest,
  type TransferResponse,
  type UserProfile,
} from '@nyx/contracts';
import {
  ExecuteTransferUseCase,
  GetTransferUseCase,
  ListTransfersUseCase,
  ReverseTransferUseCase,
} from '../application/use-cases/transfer.use-cases';
import { CurrentUser } from '../../auth/infrastructure/decorators/auth.decorators';
import { OptionalJwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly executeTransferUseCase: ExecuteTransferUseCase,
    private readonly getTransferUseCase: GetTransferUseCase,
    private readonly listTransfersUseCase: ListTransfersUseCase,
    private readonly reverseTransferUseCase: ReverseTransferUseCase,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() user?: UserProfile,
  ): Promise<TransferResponse> {
    const parseResult = createTransferSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.executeTransferUseCase.execute(parseResult.data as CreateTransferRequest, user);
  }

  @Get()
  async list(
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
  ): Promise<TransferResponse[]> {
    return this.listTransfersUseCase.execute({ accountId, status });
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<TransferResponse> {
    return this.getTransferUseCase.execute(id);
  }

  @Post(':id/reverse')
  @HttpCode(HttpStatus.OK)
  async reverse(@Param('id') id: string, @Body() body: unknown): Promise<TransferResponse> {
    const parseResult = reverseTransferSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.reverseTransferUseCase.execute(id, parseResult.data as ReverseTransferRequest);
  }
}
