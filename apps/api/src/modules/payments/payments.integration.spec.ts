import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { createTestAccessToken } from '../../testing/auth-test-helper';

describe('Payments Module Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let customerId: string;
  let accountId: string;

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
    await prisma.webhookDelivery.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.$executeRaw`TRUNCATE TABLE "ledger_entries", "ledger_transactions"`;
    await prisma.transferReversal.deleteMany();
    await prisma.deposit.deleteMany();
    await prisma.transfer.deleteMany();
    await prisma.account.deleteMany();
    await prisma.customer.deleteMany();

    customerId = randomUUID();
    await prisma.customer.create({
      data: {
        id: customerId,
        name: 'Payment Customer',
        email: `pay-${Date.now()}@nyx.local`,
        documentNumber: `DOC-PAY-${Date.now()}`,
        status: 'active',
      },
    });

    accountId = randomUUID();
    await prisma.account.create({
      data: {
        id: accountId,
        customerId,
        accountNumber: 'ACC-PAY-001',
        currency: 'USD',
        balance: 10000n,
        status: 'active',
      },
    });
  });

  describe('1. Incoming Payment Processing', () => {
    it('should process payment, credit account balance, record ledger entry, and create Outbox event atomically', async () => {
      const idempotencyKey = randomUUID();
      const res = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destinationAccountId: accountId,
          amount: '5000',
          currency: 'USD',
          method: 'pix',
          idempotencyKey,
          description: 'Pix instant deposit',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        destinationAccountId: accountId,
        amount: '5000',
        currency: 'USD',
        method: 'pix',
        status: 'completed',
        idempotencyKey,
      });

      // Verify account balance updated in PostgreSQL (10000 + 5000 = 15000 cents)
      const updatedAccount = await prisma.account.findUnique({ where: { id: accountId } });
      expect(updatedAccount?.balance).toBe(15000n);

      // Verify the customer liability is balanced by an internal clearing asset
      const ledgerTx = await prisma.ledgerTransaction.findFirst({
        where: { referenceType: 'payment', referenceId: res.body.id },
        include: { entries: true },
      });
      expect(ledgerTx).toBeDefined();
      expect(ledgerTx?.entries.length).toBeGreaterThanOrEqual(2);
      const totalDebits = ledgerTx?.entries
        .filter(entry => entry.entryType === 'debit')
        .reduce((sum, entry) => sum + entry.amount, 0n);
      const totalCredits = ledgerTx?.entries
        .filter(entry => entry.entryType === 'credit')
        .reduce((sum, entry) => sum + entry.amount, 0n);
      expect(totalDebits).toBe(5000n);
      expect(totalCredits).toBe(5000n);

      // Verify Outbox event created atomically
      const outboxEvent = await prisma.outboxEvent.findFirst({
        where: { aggregateId: res.body.id },
      });
      expect(outboxEvent).toBeDefined();
      expect(outboxEvent?.eventType).toBe('payment.completed');
      expect(outboxEvent?.status).toBe('pending');
      const payload = JSON.parse(outboxEvent?.payload ?? '{}');
      expect(payload.amount).toBe('5000');
      expect(payload.method).toBe('pix');

      // Verify audit log recorded
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'PAYMENT_PROCESSED', resourceId: res.body.id },
      });
      expect(audit).toBeDefined();
    });

    it('should support querying payment by identifier', async () => {
      const idempotencyKey = randomUUID();
      const createRes = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destinationAccountId: accountId,
          amount: 2500,
          currency: 'USD',
          method: 'credit_card',
          idempotencyKey,
        })
        .expect(201);

      const getRes = await request(app.getHttpServer())
        .get(`/payments/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(getRes.body.id).toBe(createRes.body.id);
      expect(getRes.body.method).toBe('credit_card');
    });
  });

  describe('2. Idempotency Guarantees', () => {
    it('should return identical response without duplicate crediting on idempotent retry', async () => {
      const idempotencyKey = randomUUID();
      const payload = {
        destinationAccountId: accountId,
        amount: 3000,
        currency: 'USD',
        method: 'bank_transfer' as const,
        idempotencyKey,
      };

      const res1 = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(201);
      const res2 = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(201);

      expect(res1.body.id).toBe(res2.body.id);

      // Account should be credited only once (10000 + 3000 = 13000)
      const accountInDb = await prisma.account.findUnique({ where: { id: accountId } });
      expect(accountInDb?.balance).toBe(13000n);

      const totalPayments = await prisma.payment.count({ where: { idempotencyKey } });
      expect(totalPayments).toBe(1);
    });

    it('should return 409 Conflict when idempotency key is reused with conflicting parameters', async () => {
      const idempotencyKey = randomUUID();

      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destinationAccountId: accountId,
          amount: 3000,
          currency: 'USD',
          method: 'pix',
          idempotencyKey,
        })
        .expect(201);

      const conflictRes = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destinationAccountId: accountId,
          amount: 9999,
          currency: 'USD',
          method: 'pix',
          idempotencyKey,
        })
        .expect(409);

      expect(conflictRes.body.message).toContain(
        'already exists with different payment parameters',
      );
    });

    it('should include payment method and description when checking idempotency', async () => {
      const idempotencyKey = randomUUID();
      const payload = {
        destinationAccountId: accountId,
        amount: 3000,
        currency: 'USD',
        method: 'pix' as const,
        idempotencyKey,
        description: 'First payment description',
      };

      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...payload, method: 'bank_transfer', description: 'Changed payment' })
        .expect(409);
    });

    it('should preserve large payment amounts in the response', async () => {
      const exactAmount = 9007199254740993n;
      const response = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destinationAccountId: accountId,
          amount: exactAmount.toString(),
          currency: 'USD',
          method: 'pix',
          idempotencyKey: randomUUID(),
        })
        .expect(201);

      expect(response.body.amount).toBe(exactAmount.toString());
      expect(await prisma.payment.findUnique({ where: { id: response.body.id } })).toMatchObject({
        amount: exactAmount,
      });
    });

    it('should return the same payment for concurrent retries with one idempotency key', async () => {
      const payload = {
        destinationAccountId: accountId,
        amount: 2000,
        currency: 'USD',
        method: 'pix',
        idempotencyKey: randomUUID(),
      };

      const responses = await Promise.all(
        Array.from({ length: 2 }, () =>
          request(app.getHttpServer())
            .post('/payments')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload),
        ),
      );

      expect(responses.map(response => response.status)).toEqual([201, 201]);
      expect(responses[0]?.body.id).toBe(responses[1]?.body.id);
      const account = await prisma.account.findUnique({ where: { id: accountId } });
      expect(account?.balance).toBe(12000n);
    });

    it('should page through payments for an account without duplicates', async () => {
      for (let index = 0; index < 3; index++) {
        await request(app.getHttpServer())
          .post('/payments')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            destinationAccountId: accountId,
            amount: '100',
            currency: 'USD',
            method: 'pix',
            idempotencyKey: randomUUID(),
          })
          .expect(201);
      }

      const firstPage = await request(app.getHttpServer())
        .get(`/payments?accountId=${accountId}&limit=2`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(firstPage.body.items).toHaveLength(2);
      expect(firstPage.body.hasMore).toBe(true);

      const secondPage = await request(app.getHttpServer())
        .get(`/payments?accountId=${accountId}&limit=2&cursor=${firstPage.body.nextCursor}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.hasMore).toBe(false);
    });
  });

  describe('3. Validation and Invariants', () => {
    it('should reject a ledger transaction with only one posting at the database boundary', async () => {
      await expect(
        prisma.ledgerTransaction.create({
          data: {
            id: randomUUID(),
            description: 'Invalid unilateral posting',
            referenceType: 'payment',
            referenceId: randomUUID(),
            entries: {
              create: {
                id: randomUUID(),
                accountId,
                entryType: 'credit',
                amount: 100n,
                currency: 'USD',
                sequenceNumber: 1,
              },
            },
          },
        }),
      ).rejects.toThrow('at least two balanced postings');
    });

    it('should reject changes to posted ledger entries', async () => {
      const paymentResponse = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destinationAccountId: accountId,
          amount: 500,
          currency: 'USD',
          method: 'pix',
          idempotencyKey: randomUUID(),
        })
        .expect(201);

      const entry = await prisma.ledgerEntry.findFirst({
        where: {
          transaction: { referenceType: 'payment', referenceId: paymentResponse.body.id },
        },
      });
      expect(entry).toBeDefined();

      await expect(
        prisma.ledgerEntry.update({
          where: { id: entry!.id },
          data: { amount: entry!.amount + 1n },
        }),
      ).rejects.toThrow('posted ledger records are immutable');

      await expect(
        prisma.ledgerTransaction.update({
          where: { id: entry!.transactionId },
          data: { description: 'Altered after posting' },
        }),
      ).rejects.toThrow('posted ledger records are immutable');
    });

    it('should reject payment with incompatible currency (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destinationAccountId: accountId,
          amount: 1000,
          currency: 'EUR',
          method: 'pix',
          idempotencyKey: randomUUID(),
        })
        .expect(400);
    });

    it('should reject payment for non-existent account (404 Not Found)', async () => {
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destinationAccountId: randomUUID(),
          amount: 1000,
          currency: 'USD',
          method: 'pix',
          idempotencyKey: randomUUID(),
        })
        .expect(404);
    });
  });
});
