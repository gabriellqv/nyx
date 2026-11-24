import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import {
  createCustomerSchema,
  type CreateCustomerRequest,
  type CustomerResponse,
  type UserProfile,
} from '@nyx/contracts';
import {
  CreateCustomerUseCase,
  GetCustomerUseCase,
  ListCustomersUseCase,
} from '../application/use-cases/customer.use-cases';
import { CurrentUser, Roles } from '../../auth/infrastructure/decorators/auth.decorators';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly createCustomerUseCase: CreateCustomerUseCase,
    private readonly getCustomerUseCase: GetCustomerUseCase,
    private readonly listCustomersUseCase: ListCustomersUseCase,
  ) {}

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<CustomerResponse> {
    const parseResult = createCustomerSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.createCustomerUseCase.execute(parseResult.data as CreateCustomerRequest);
  }

  @Get()
  @Roles('admin', 'auditor')
  async list(): Promise<CustomerResponse[]> {
    return this.listCustomersUseCase.execute();
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
  ): Promise<CustomerResponse> {
    return this.getCustomerUseCase.execute(id, user);
  }
}
