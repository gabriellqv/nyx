import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { createTestAccessToken } from '../../testing/auth-test-helper';

describe('Reconciliation Module Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditorToken: string;
  let customerId: string;
  let accountAId: string;
  let accountBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    auditorToken = createTestAccessToken(app, { role: 'auditor' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.reconciliationLog.deleteMany();
    await prisma.webhookDelivery.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.ledgerTransaction.deleteMany();
    await prisma.transfer.deleteMany();
    await prisma.account.deleteMany();
    await prisma.customer.deleteMany();

    customerId = randomUUID();
    await prisma.customer.create({
      data: {
        id: customerId,
        name: 'Reconciliation Customer',
        email: `recon-${Date.now()}@nyx.local`,
        documentNumber: `DOC-RECON-${Date.now()}`,
        status: 'active',
      },
    });

    accountAId = randomUUID();
    accountBId = randomUUID();

    // Create Account A with 10,000 cents and balanced opening ledger entry
    await prisma.account.create({
      data: {
        id: accountAId,
        customerId,
        accountNumber: 'ACC-REC-A',
        currency: 'USD',
        balance: 10000n,
        status: 'active',
      },
    });

    await prisma.ledgerTransaction.create({
      data: {
        id: randomUUID(),
        description: 'Opening balance for ACC-REC-A',
        referenceType: 'deposit',
        referenceId: accountAId,
        entries: {
          create: [
            {
              id: randomUUID(),
              accountId: accountAId,
              entryType: 'credit',
              amount: 10000n,
              currency: 'USD',
              sequenceNumber: 1,
            },
          ],
        },
      },
    });

    // Create Account B with 0 balance
    await prisma.account.create({
      data: {
        id: accountBId,
        customerId,
        accountNumber: 'ACC-REC-B',
        currency: 'USD',
        balance: 0n,
        status: 'active',
      },
    });
  });

  describe('1. Clean Reconciliation Execution', () => {
    it('should report balanced status when accounts match double-entry ledger entries', async () => {
      // Execute a transfer from A to B (2,000 cents)
      await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${createTestAccessToken(app, { role: 'admin' })}`)
        .send({
          idempotencyKey: randomUUID(),
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: 2000,
          currency: 'USD',
        })
        .expect(201);

      // Run reconciliation
      const res = await request(app.getHttpServer())
        .post('/reconciliation/run')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({})
        .expect(200);

      expect(res.body.status).toBe('balanced');
      expect(res.body.totalAccountsAudited).toBe(2);
      expect(res.body.balancedAccountsCount).toBe(2);
      expect(res.body.discrepantAccountsCount).toBe(0);

      // Account A: 10,000 opening credit - 2,000 debit = 8,000
      const detailA = res.body.details.find(
        (d: { accountId: string }) => d.accountId === accountAId,
      );
      expect(detailA).toBeDefined();
      expect(detailA.accountBalance).toBe(8000);
      expect(detailA.ledgerBalance).toBe(8000);
      expect(detailA.discrepancy).toBe(0);
      expect(detailA.isBalanced).toBe(true);

      // Account B: 0 opening + 2,000 credit = 2,000
      const detailB = res.body.details.find(
        (d: { accountId: string }) => d.accountId === accountBId,
      );
      expect(detailB).toBeDefined();
      expect(detailB.accountBalance).toBe(2000);
      expect(detailB.ledgerBalance).toBe(2000);
      expect(detailB.discrepancy).toBe(0);
      expect(detailB.isBalanced).toBe(true);

      // Verify audit log and reconciliation log in database
      const reconLog = await prisma.reconciliationLog.findUnique({
        where: { id: res.body.id },
      });
      expect(reconLog).toBeDefined();
      expect(reconLog?.status).toBe('balanced');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'RECONCILIATION_COMPLETED', resourceId: res.body.id },
      });
      expect(audit).toBeDefined();
    });

    it('should support querying reconciliation history', async () => {
      await request(app.getHttpServer())
        .post('/reconciliation/run')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({});

      const res = await request(app.getHttpServer())
        .get('/reconciliation/history')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]?.status).toBe('balanced');
    });
  });

  describe('2. Discrepancy Detection and Alerting', () => {
    it('should detect and flag discrepancy when account balance deviates from ledger entries', async () => {
      // Artificially tamper with Account A balance directly in DB without a ledger entry
      await prisma.account.update({
        where: { id: accountAId },
        data: { balance: 99999n },
      });

      // Run reconciliation
      const res = await request(app.getHttpServer())
        .post('/reconciliation/run')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({})
        .expect(200);

      expect(res.body.status).toBe('discrepant');
      expect(res.body.discrepantAccountsCount).toBe(1);
      expect(res.body.balancedAccountsCount).toBe(1);

      const detailA = res.body.details.find(
        (d: { accountId: string }) => d.accountId === accountAId,
      );
      expect(detailA).toBeDefined();
      expect(detailA.isBalanced).toBe(false);
      expect(detailA.accountBalance).toBe(99999);
      expect(detailA.ledgerBalance).toBe(10000);
      expect(detailA.discrepancy).toBe(89999);
    });
  });
});
