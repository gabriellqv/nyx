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
  createTransferSchema,
  reverseTransferSchema,
  type CreateTransferRequest,
  type ReverseTransferRequest,
  type TransferResponse,
  type TransferPageResponse,
  type UserProfile,
} from '@nyx/contracts';
import { cursorPaginationSchema } from '@nyx/contracts';
import {
  ExecuteTransferUseCase,
  GetTransferUseCase,
  ListTransfersUseCase,
  ReverseTransferUseCase,
} from '../application/use-cases/transfer.use-cases';
import { CurrentUser, Roles } from '../../auth/infrastructure/decorators/auth.decorators';
import { createAuditRequestContext } from '../../audit/audit.service';
import { CORRELATION_ID_HEADER } from '../../../common/middleware/correlation-id.middleware';

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly executeTransferUseCase: ExecuteTransferUseCase,
    private readonly getTransferUseCase: GetTransferUseCase,
    private readonly listTransfersUseCase: ListTransfersUseCase,
    private readonly reverseTransferUseCase: ReverseTransferUseCase,
  ) {}

  @Post()
  @Roles('user', 'admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: UserProfile,
    @Ip() ipAddress: string,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<TransferResponse> {
    const parseResult = createTransferSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.executeTransferUseCase.execute(
      parseResult.data as CreateTransferRequest,
      user,
      createAuditRequestContext(user.id, ipAddress, correlationId),
    );
  }

  @Get()
  async list(
    @CurrentUser() user: UserProfile,
    @Query('accountId') accountId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TransferPageResponse> {
    const pagination = cursorPaginationSchema.safeParse({ limit, cursor });
    if (!pagination.success) {
      throw new BadRequestException(pagination.error.format());
    }
    return this.listTransfersUseCase.execute(user, pagination.data, { accountId, status });
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
  ): Promise<TransferResponse> {
    return this.getTransferUseCase.execute(id, user);
  }

  @Post(':id/reverse')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async reverse(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserProfile,
    @Ip() ipAddress: string,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<TransferResponse> {
    const parseResult = reverseTransferSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.reverseTransferUseCase.execute(
      id,
      parseResult.data as ReverseTransferRequest,
      createAuditRequestContext(user.id, ipAddress, correlationId),
    );
  }
}
