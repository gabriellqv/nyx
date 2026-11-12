import { Module } from '@nestjs/common';
import { ACCOUNT_REPOSITORY } from './application/ports/account.repository';
import { PrismaAccountRepository } from './infrastructure/persistence/prisma-account.repository';
import {
  CreateAccountUseCase,
  GetAccountUseCase,
  ListAccountsUseCase,
  DepositFundsUseCase,
  ReconcileAccountUseCase,
} from './application/use-cases/account.use-cases';
import { AccountsController } from './presentation/accounts.controller';
import { CustomersModule } from '../customers/customers.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [CustomersModule, LedgerModule],
  controllers: [AccountsController],
  providers: [
    {
      provide: ACCOUNT_REPOSITORY,
      useClass: PrismaAccountRepository,
    },
    CreateAccountUseCase,
    GetAccountUseCase,
    ListAccountsUseCase,
    DepositFundsUseCase,
    ReconcileAccountUseCase,
  ],
  exports: [ACCOUNT_REPOSITORY],
})
export class AccountsModule {}
