import { Module } from '@nestjs/common';
import { DoubleEntryLedgerService } from './domain/services/double-entry.service';
import { LEDGER_REPOSITORY } from './application/ports/ledger.repository';
import { PrismaLedgerRepository } from './infrastructure/persistence/prisma-ledger.repository';

@Module({
  providers: [
    DoubleEntryLedgerService,
    {
      provide: LEDGER_REPOSITORY,
      useClass: PrismaLedgerRepository,
    },
  ],
  exports: [DoubleEntryLedgerService, LEDGER_REPOSITORY],
})
export class LedgerModule {}
