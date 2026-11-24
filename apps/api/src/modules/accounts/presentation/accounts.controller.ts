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
  createAccountSchema,
  depositRequestSchema,
  type CreateAccountRequest,
  type DepositRequest,
  type AccountResponse,
  type LedgerReconciliationResponse,
  type UserProfile,
} from '@nyx/contracts';
import {
  CreateAccountUseCase,
  GetAccountUseCase,
  ListAccountsUseCase,
  DepositFundsUseCase,
  ReconcileAccountUseCase,
} from '../application/use-cases/account.use-cases';
import { CurrentUser, Roles } from '../../auth/infrastructure/decorators/auth.decorators';
import { createAuditRequestContext } from '../../audit/audit.service';
import { CORRELATION_ID_HEADER } from '../../../common/middleware/correlation-id.middleware';

@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly createAccountUseCase: CreateAccountUseCase,
    private readonly getAccountUseCase: GetAccountUseCase,
    private readonly listAccountsUseCase: ListAccountsUseCase,
    private readonly depositFundsUseCase: DepositFundsUseCase,
    private readonly reconcileAccountUseCase: ReconcileAccountUseCase,
  ) {}

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: UserProfile,
    @Ip() ipAddress: string,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<AccountResponse> {
    const parseResult = createAccountSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.createAccountUseCase.execute(
      parseResult.data as CreateAccountRequest,
      createAuditRequestContext(user.id, ipAddress, correlationId),
    );
  }

  @Get()
  async list(
    @CurrentUser() user: UserProfile,
    @Query('customerId') customerId?: string,
  ): Promise<AccountResponse[]> {
    return this.listAccountsUseCase.execute(user, customerId);
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
  ): Promise<AccountResponse> {
    return this.getAccountUseCase.execute(id, user);
  }

  @Post(':id/deposit')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deposit(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: UserProfile,
    @Ip() ipAddress: string,
    @Headers(CORRELATION_ID_HEADER) correlationId?: string,
  ): Promise<AccountResponse> {
    const parseResult = depositRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.depositFundsUseCase.execute(
      id,
      parseResult.data as DepositRequest,
      createAuditRequestContext(user.id, ipAddress, correlationId),
    );
  }

  @Get(':id/reconcile')
  async reconcile(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
  ): Promise<LedgerReconciliationResponse> {
    return this.reconcileAccountUseCase.execute(id, user);
  }
}
