import { Module } from '@nestjs/common';
import { TRANSFER_REPOSITORY } from './application/ports/transfer.repository';
import { PrismaTransferRepository } from './infrastructure/persistence/prisma-transfer.repository';
import {
  ExecuteTransferUseCase,
  GetTransferUseCase,
  ListTransfersUseCase,
  ReverseTransferUseCase,
} from './application/use-cases/transfer.use-cases';
import { TransfersController } from './presentation/transfers.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { AccountsModule } from '../accounts/accounts.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [LedgerModule, AccountsModule, AuthModule],
  controllers: [TransfersController],
  providers: [
    {
      provide: TRANSFER_REPOSITORY,
      useClass: PrismaTransferRepository,
    },
    ExecuteTransferUseCase,
    GetTransferUseCase,
    ListTransfersUseCase,
    ReverseTransferUseCase,
  ],
  exports: [TRANSFER_REPOSITORY],
})
export class TransfersModule {}
