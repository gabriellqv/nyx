import { Module } from '@nestjs/common';
import { CUSTOMER_REPOSITORY } from './application/ports/customer.repository';
import { PrismaCustomerRepository } from './infrastructure/persistence/prisma-customer.repository';
import {
  CreateCustomerUseCase,
  GetCustomerUseCase,
  ListCustomersUseCase,
} from './application/use-cases/customer.use-cases';
import { CustomersController } from './presentation/customers.controller';

@Module({
  controllers: [CustomersController],
  providers: [
    {
      provide: CUSTOMER_REPOSITORY,
      useClass: PrismaCustomerRepository,
    },
    CreateCustomerUseCase,
    GetCustomerUseCase,
    ListCustomersUseCase,
  ],
  exports: [CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
