import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { createTestAccessToken } from '../../testing/auth-test-helper';

describe('Financial Domain Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  let customerId: string;
  let accountAId: string;
  let accountBId: string;
  let accountEurId: string;
  let accountDId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    adminToken = createTestAccessToken(app, { role: 'admin' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Clear financial tables in correct dependency order
    await prisma.$executeRaw`TRUNCATE TABLE "ledger_entries", "ledger_transactions"`;
    await prisma.transfer.deleteMany();
    await prisma.account.deleteMany();
    await prisma.customer.deleteMany();

    // Create test customer
    customerId = randomUUID();
    await prisma.customer.create({
      data: {
        id: customerId,
        name: 'Financial Test Customer',
        email: `test-${Date.now()}@nyx.local`,
        documentNumber: `DOC-${Date.now()}`,
        status: 'active',
      },
    });

    const seedAccount = async (
      id: string,
      accountNumber: string,
      currency: string,
      balance: bigint,
    ) => {
      await prisma.account.create({
        data: {
          id,
          customerId,
          accountNumber,
          currency,
          type: 'checking',
          status: 'active',
          balance,
        },
      });

      if (balance > 0n) {
        const openingFunds = await prisma.ledgerAccount.upsert({
          where: { code_currency: { code: 'opening-funds', currency } },
          create: {
            id: randomUUID(),
            code: 'opening-funds',
            name: 'Opening funds clearing',
            currency,
            accountType: 'asset',
          },
          update: {},
        });

        await prisma.ledgerTransaction.create({
          data: {
            id: randomUUID(),
            description: `Opening balance for ${accountNumber}`,
            referenceType: 'deposit',
            referenceId: id,
            entries: {
              create: [
                {
                  id: randomUUID(),
                  ledgerAccountId: openingFunds.id,
                  entryType: 'debit',
                  amount: balance,
                  currency,
                  sequenceNumber: 1,
                },
                {
                  id: randomUUID(),
                  accountId: id,
                  entryType: 'credit',
                  amount: balance,
                  currency,
                  sequenceNumber: 2,
                },
              ],
            },
          },
        });
      }
    };

    // Create Account A (USD, balance: 100,000 cents = $1,000.00)
    accountAId = randomUUID();
    await seedAccount(accountAId, 'ACC-USD-001', 'USD', 100000n);

    // Create Account B (USD, balance: 20,000 cents = $200.00)
    accountBId = randomUUID();
    await seedAccount(accountBId, 'ACC-USD-002', 'USD', 20000n);

    // Create Account EUR (EUR, balance: 50,000 cents = 500.00 EUR)
    accountEurId = randomUUID();
    await seedAccount(accountEurId, 'ACC-EUR-001', 'EUR', 50000n);

    // Create Account D for Concurrency (USD, balance: 1,000 cents = $10.00)
    accountDId = randomUUID();
    await seedAccount(accountDId, 'ACC-USD-CONC', 'USD', 1000n);
  });

  describe('1. Successful Atomic Transfer and Double-Entry Ledger Posting', () => {
    it('should transfer funds atomically and record balanced debit and credit entries', async () => {
      const idempotencyKey = randomUUID();
      const transferAmount = 15000; // $150.00

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: transferAmount,
          currency: 'USD',
          idempotencyKey,
          description: 'Payment for services',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('posted');
      expect(response.body.amount).toBe(transferAmount);

      // Verify updated account balances
      const accountA = await prisma.account.findUnique({ where: { id: accountAId } });
      const accountB = await prisma.account.findUnique({ where: { id: accountBId } });

      expect(accountA?.balance).toBe(85000n); // 100,000 - 15,000 = 85,000 ($850.00)
      expect(accountB?.balance).toBe(35000n); // 20,000 + 15,000 = 35,000 ($350.00)

      // Verify double-entry ledger entries
      const ledgerTx = await prisma.ledgerTransaction.findFirst({
        where: { referenceId: response.body.id },
        include: { entries: true },
      });

      expect(ledgerTx).toBeDefined();
      expect(ledgerTx?.entries).toHaveLength(2);

      const debitEntry = ledgerTx?.entries.find(e => e.entryType === 'debit');
      const creditEntry = ledgerTx?.entries.find(e => e.entryType === 'credit');

      expect(debitEntry?.accountId).toBe(accountAId);
      expect(debitEntry?.amount).toBe(BigInt(transferAmount));

      expect(creditEntry?.accountId).toBe(accountBId);
      expect(creditEntry?.amount).toBe(BigInt(transferAmount));

      // Balance of debits and credits
      expect(debitEntry?.amount).toBe(creditEntry?.amount);

      // Verify ledger reconciliation endpoint
      const reconA = await request(app.getHttpServer())
        .get(`/accounts/${accountAId}/reconcile`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(reconA.body.isReconciled).toBe(true);
      expect(reconA.body.discrepancy).toBe(0);
    });
  });

  describe('2. Financial Invariants and Error Handling', () => {
    it('should reject transfer when source account has insufficient funds', async () => {
      const idempotencyKey = randomUUID();
      const excessAmount = 500000; // $5,000.00 (Account A only has $1,000.00)

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: excessAmount,
          currency: 'USD',
          idempotencyKey,
        })
        .expect(400);

      expect(response.body.message).toContain('insufficient funds');

      // Balances must remain strictly unchanged
      const accountA = await prisma.account.findUnique({ where: { id: accountAId } });
      const accountB = await prisma.account.findUnique({ where: { id: accountBId } });

      expect(accountA?.balance).toBe(100000n);
      expect(accountB?.balance).toBe(20000n);
    });

    it('should reject transfer across incompatible currencies', async () => {
      const idempotencyKey = randomUUID();

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountEurId,
          amount: 5000,
          currency: 'USD',
          idempotencyKey,
        })
        .expect(400);

      expect(response.body.message).toContain('currency');
    });

    it('should reject transfer with same source and destination account', async () => {
      const idempotencyKey = randomUUID();

      await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountAId,
          amount: 5000,
          currency: 'USD',
          idempotencyKey,
        })
        .expect(400);
    });
  });

  describe('3. Idempotency Guarantees', () => {
    it('should return identical response and not duplicate financial operations on duplicate idempotency key', async () => {
      const idempotencyKey = randomUUID();
      const transferAmount = 10000;

      // First request
      const firstResponse = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: transferAmount,
          currency: 'USD',
          idempotencyKey,
        })
        .expect(201);

      // Second identical request
      const secondResponse = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: transferAmount,
          currency: 'USD',
          idempotencyKey,
        })
        .expect(201);

      expect(secondResponse.body.id).toBe(firstResponse.body.id);

      // Verify that balance was deducted only once
      const accountA = await prisma.account.findUnique({ where: { id: accountAId } });
      expect(accountA?.balance).toBe(90000n); // 100,000 - 10,000 = 90,000
    });

    it('should return 409 Conflict if same idempotency key is reused with different parameters', async () => {
      const idempotencyKey = randomUUID();

      await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: 10000,
          currency: 'USD',
          idempotencyKey,
        })
        .expect(201);

      // Re-send with altered amount
      await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: 25000,
          currency: 'USD',
          idempotencyKey,
        })
        .expect(409);
    });
  });

  describe('4. Transfer Reversal Behavior', () => {
    it('should reverse a posted transfer and record balanced reverse entries', async () => {
      const idempotencyKey = randomUUID();
      const transferAmount = 5000;

      const transferRes = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: transferAmount,
          currency: 'USD',
          idempotencyKey,
        })
        .expect(201);

      const transferId = transferRes.body.id;

      // Reverse transfer
      const reversalRes = await request(app.getHttpServer())
        .post(`/transfers/${transferId}/reverse`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Customer requested cancellation',
          idempotencyKey: randomUUID(),
        })
        .expect(200);

      expect(reversalRes.body.status).toBe('reversed');

      // Balances must be restored to original values
      const accountA = await prisma.account.findUnique({ where: { id: accountAId } });
      const accountB = await prisma.account.findUnique({ where: { id: accountBId } });

      expect(accountA?.balance).toBe(100000n);
      expect(accountB?.balance).toBe(20000n);

      // Reversal ledger transaction exists
      const reversalTx = await prisma.ledgerTransaction.findFirst({
        where: { referenceType: 'reversal', referenceId: transferId },
        include: { entries: true },
      });

      expect(reversalTx).toBeDefined();
      expect(reversalTx?.entries).toHaveLength(2);
    });
  });

  describe('5. Concurrency and Race Condition Protection', () => {
    it('should prevent double spending under concurrent transfer requests against the same source account', async () => {
      // Account D starts with exactly 1,000 cents ($10.00)
      // We fire 5 concurrent requests of 600 cents ($6.00) simultaneously.
      // 5 * 600 = 3,000 cents.
      // With strict row-level locking, exactly 1 request MUST succeed (1,000 - 600 = 400 cents remaining),
      // and the other 4 requests MUST fail with 400 Bad Request (insufficient funds).
      const transferAmount = 600;
      const concurrentRequests = 5;

      const requests = Array.from({ length: concurrentRequests }, () =>
        request(app.getHttpServer())
          .post('/transfers')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            sourceAccountId: accountDId,
            destinationAccountId: accountBId,
            amount: transferAmount,
            currency: 'USD',
            idempotencyKey: randomUUID(),
          }),
      );

      const responses = await Promise.all(requests);

      const successful = responses.filter(r => r.status === 201);
      const failed = responses.filter(r => r.status === 400);

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(4);

      // The final balance of Account D MUST be exactly 400 cents (1,000 - 600).
      // It must NEVER be negative.
      const accountD = await prisma.account.findUnique({ where: { id: accountDId } });
      expect(accountD?.balance).toBe(400n);
    });
  });
});
