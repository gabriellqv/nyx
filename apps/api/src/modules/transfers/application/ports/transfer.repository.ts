import { Transfer } from '../../domain/entities/transfer.entity';
import type { CursorPage } from '@nyx/contracts';
import type { CursorPagination } from '../../../common/application/cursor-pagination';

export const TRANSFER_REPOSITORY = Symbol('TRANSFER_REPOSITORY');

export interface ITransferRepository {
  findById(id: string): Promise<Transfer | null>;
  findByIdempotencyKey(key: string): Promise<Transfer | null>;
  findAll(filters: {
    accountId?: string | undefined;
    status?: string | undefined;
    customerId?: string | undefined;
    pagination: CursorPagination;
  }): Promise<CursorPage<Transfer>>;
  save(transfer: Transfer): Promise<Transfer>;
}
