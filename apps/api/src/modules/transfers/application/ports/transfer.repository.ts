import { Transfer } from '../../domain/entities/transfer.entity';

export const TRANSFER_REPOSITORY = Symbol('TRANSFER_REPOSITORY');

export interface ITransferRepository {
  findById(id: string): Promise<Transfer | null>;
  findByIdempotencyKey(key: string): Promise<Transfer | null>;
  findAll(filters?: {
    accountId?: string | undefined;
    status?: string | undefined;
  }): Promise<Transfer[]>;
  save(transfer: Transfer): Promise<Transfer>;
}
