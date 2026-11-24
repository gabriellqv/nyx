import { Module } from '@nestjs/common';
import { PAYMENT_REPOSITORY } from './application/ports/payment.repository';
import { PrismaPaymentRepository } from './infrastructure/persistence/prisma-payment.repository';
import {
  ProcessPaymentUseCase,
  GetPaymentUseCase,
  ListPaymentsUseCase,
} from './application/use-cases/payment.use-cases';
import { PaymentsController } from './presentation/payments.controller';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [PaymentsController],
  providers: [
    {
      provide: PAYMENT_REPOSITORY,
      useClass: PrismaPaymentRepository,
    },
    ProcessPaymentUseCase,
    GetPaymentUseCase,
    ListPaymentsUseCase,
  ],
  exports: [PAYMENT_REPOSITORY],
})
export class PaymentsModule {}
