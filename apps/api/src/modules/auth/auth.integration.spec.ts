import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { CORRELATION_ID_HEADER } from '../../common/middleware/correlation-id.middleware';
import { createTestAccessToken } from '../../testing/auth-test-helper';

describe('Auth, Security, and Audit Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(helmet());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
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
    await prisma.user.deleteMany();
    await prisma.$executeRaw`TRUNCATE TABLE "ledger_entries", "ledger_transactions"`;
    await prisma.transfer.deleteMany();
    await prisma.account.deleteMany();
    await prisma.customer.deleteMany();
  });

  describe('1. User Registration and Password Security', () => {
    it('should register a new user with bcrypt password hashing and return JWT token', async () => {
      const payload = {
        name: 'Alice Johnson',
        email: 'alice@nyx.local',
        password: 'securePassword123!',
        role: 'user' as const,
      };

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user).toMatchObject({
        name: 'Alice Johnson',
        email: 'alice@nyx.local',
        role: 'user',
      });
      expect(res.body.user.passwordHash).toBeUndefined();

      const userInDb = await prisma.user.findUnique({
        where: { email: 'alice@nyx.local' },
      });
      expect(userInDb).toBeDefined();
      expect(userInDb?.passwordHash).not.toBe(payload.password);
      expect(userInDb?.passwordHash.startsWith('$2b$')).toBe(true);
    });

    it('should reject registration with duplicate email with 409 Conflict', async () => {
      const payload = {
        name: 'Bob Johnson',
        email: 'bob@nyx.local',
        password: 'securePassword123!',
        role: 'user' as const,
      };

      await request(app.getHttpServer()).post('/auth/register').send(payload).expect(201);

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(payload)
        .expect(409);

      expect(res.body.message).toContain('already exists');
    });

    it('should reject registration with invalid payload with 400 Bad Request', async () => {
      const invalidPayload = {
        name: 'A',
        email: 'not-an-email',
        password: 'short',
      };

      await request(app.getHttpServer()).post('/auth/register').send(invalidPayload).expect(400);
    });

    it('should ignore privileged role and customer association from public registration', async () => {
      const customerId = randomUUID();
      await prisma.customer.create({
        data: {
          id: customerId,
          name: 'Existing Customer',
          email: 'existing.customer@nyx.local',
          documentNumber: `DOC-REG-${Date.now()}`,
          status: 'active',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Untrusted Registrant',
          email: 'untrusted@nyx.local',
          password: 'securePassword123!',
          role: 'admin',
          customerId,
        })
        .expect(201);

      expect(res.body.user.role).toBe('user');
      expect(res.body.user.customerId).toBeNull();

      const user = await prisma.user.findUnique({
        where: { email: 'untrusted@nyx.local' },
      });
      expect(user?.role).toBe('user');
      expect(user?.customerId).toBeNull();
    });
  });

  describe('2. User Authentication and Credential Verification', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post('/auth/register').send({
        name: 'Registered User',
        email: 'auth.test@nyx.local',
        password: 'correctPassword123',
        role: 'user',
      });
    });

    it('should authenticate user with valid credentials and return JWT token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'auth.test@nyx.local',
          password: 'correctPassword123',
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('auth.test@nyx.local');
    });

    it('should reject login with incorrect password with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'auth.test@nyx.local',
          password: 'wrongPassword123',
        })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should reject login with non-existent email with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@nyx.local',
          password: 'correctPassword123',
        })
        .expect(401);

      expect(res.body.message).toBe('Invalid email or password');
    });
  });

  describe('3. Protected Route Access and JWT Verification', () => {
    let validToken: string;

    beforeEach(async () => {
      const regRes = await request(app.getHttpServer()).post('/auth/register').send({
        name: 'Protected User',
        email: 'protected@nyx.local',
        password: 'securePassword123!',
      });
      validToken = regRes.body.accessToken;
    });

    it('should return user profile on /auth/me when valid Bearer token is provided', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(res.body).toMatchObject({
        email: 'protected@nyx.local',
        name: 'Protected User',
        role: 'user',
      });
    });

    it('should return 401 Unauthorized on /auth/me when no token is provided', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should return 401 Unauthorized on /auth/me when malformed token is provided', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload')
        .expect(401);
    });

    it('should reject anonymous access to account data', async () => {
      await request(app.getHttpServer()).get('/accounts').expect(401);
    });
  });

  describe('4. Account Ownership and Authorization Boundaries', () => {
    let customerAId: string;
    let customerBId: string;
    let accountAId: string;
    let accountBId: string;
    let tokenUserA: string;
    let tokenUserB: string;
    let tokenAdmin: string;

    beforeEach(async () => {
      customerAId = randomUUID();
      await prisma.customer.create({
        data: {
          id: customerAId,
          name: 'Customer A',
          email: 'customer.a@nyx.local',
          documentNumber: `DOC-A-${Date.now()}`,
          status: 'active',
        },
      });

      customerBId = randomUUID();
      await prisma.customer.create({
        data: {
          id: customerBId,
          name: 'Customer B',
          email: 'customer.b@nyx.local',
          documentNumber: `DOC-B-${Date.now()}`,
          status: 'active',
        },
      });

      accountAId = randomUUID();
      await prisma.account.create({
        data: {
          id: accountAId,
          customerId: customerAId,
          accountNumber: 'ACC-A-001',
          currency: 'USD',
          balance: 100000n,
          status: 'active',
        },
      });

      accountBId = randomUUID();
      await prisma.account.create({
        data: {
          id: accountBId,
          customerId: customerBId,
          accountNumber: 'ACC-B-001',
          currency: 'USD',
          balance: 50000n,
          status: 'active',
        },
      });

      tokenUserA = createTestAccessToken(app, {
        role: 'user',
        customerId: customerAId,
      });

      tokenUserB = createTestAccessToken(app, {
        role: 'user',
        customerId: customerBId,
      });

      tokenAdmin = createTestAccessToken(app, {
        role: 'admin',
      });
    });

    it('should reject transfer when user attempts to debit an account owned by another customer (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          idempotencyKey: randomUUID(),
          sourceAccountId: accountBId,
          destinationAccountId: accountAId,
          amount: 1000,
          currency: 'USD',
        })
        .expect(403);

      expect(res.body.message).toContain('not authorized to debit this source account');
    });

    it('should reject access to an account owned by another customer', async () => {
      await request(app.getHttpServer())
        .get(`/accounts/${accountBId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(403);
    });

    it('should list only accounts owned by the authenticated customer', async () => {
      const res = await request(app.getHttpServer())
        .get('/accounts')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(accountAId);
    });

    it('should reject financial operations for a user without a customer association', async () => {
      const tokenWithoutCustomer = createTestAccessToken(app, { role: 'user' });

      await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${tokenWithoutCustomer}`)
        .send({
          idempotencyKey: randomUUID(),
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: 1000,
          currency: 'USD',
        })
        .expect(403);
    });

    it('should enforce source account ownership on an idempotent transfer retry', async () => {
      const payload = {
        idempotencyKey: randomUUID(),
        sourceAccountId: accountAId,
        destinationAccountId: accountBId,
        amount: 1000,
        currency: 'USD',
      };

      await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send(payload)
        .expect(201);

      await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send(payload)
        .expect(403);
    });

    it('should prevent regular users from depositing funds', async () => {
      await request(app.getHttpServer())
        .post(`/accounts/${accountAId}/deposit`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          amount: 1000,
          idempotencyKey: randomUUID(),
        })
        .expect(403);
    });

    it('should restrict administrative financial endpoints by role', async () => {
      await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .post('/reconciliation/run')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({})
        .expect(403);

      await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({})
        .expect(403);
    });

    it('should enforce account ownership when reading payments', async () => {
      const payment = await request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          destinationAccountId: accountAId,
          amount: 1000,
          currency: 'USD',
          method: 'pix',
          idempotencyKey: randomUUID(),
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/payments/${payment.body.id}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/payments/${payment.body.id}`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(403);
    });

    it('should allow auditors to read accounts without granting write access', async () => {
      const auditorToken = createTestAccessToken(app, { role: 'auditor' });

      const accounts = await request(app.getHttpServer())
        .get('/accounts')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
      expect(accounts.body).toHaveLength(2);

      await request(app.getHttpServer())
        .post(`/accounts/${accountAId}/deposit`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          amount: 1000,
          idempotencyKey: randomUUID(),
        })
        .expect(403);
    });

    it('should allow transfer when user debits their own account (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          idempotencyKey: randomUUID(),
          sourceAccountId: accountAId,
          destinationAccountId: accountBId,
          amount: 2500,
          currency: 'USD',
        })
        .expect(201);

      expect(res.body.status).toBe('posted');
    });

    it('should allow transfer by an admin user from any source account (201 Created)', async () => {
      const res = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          idempotencyKey: randomUUID(),
          sourceAccountId: accountBId,
          destinationAccountId: accountAId,
          amount: 1500,
          currency: 'USD',
        })
        .expect(201);

      expect(res.body.status).toBe('posted');
    });
  });

  describe('5. Immutable Audit Trail Persistence', () => {
    it('should record audit logs when creating accounts, depositing funds, and executing transfers', async () => {
      const tokenAdmin = createTestAccessToken(app, { role: 'admin' });
      const custId = randomUUID();
      await prisma.customer.create({
        data: {
          id: custId,
          name: 'Audit Customer',
          email: 'audit@nyx.local',
          documentNumber: `DOC-AUDIT-${Date.now()}`,
          status: 'active',
        },
      });

      const accRes1 = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          customerId: custId,
          currency: 'USD',
          type: 'checking',
          initialDeposit: 10000,
        })
        .expect(201);

      const accRes2 = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          customerId: custId,
          currency: 'USD',
          type: 'checking',
        })
        .expect(201);

      const auditCreated = await prisma.auditLog.findMany({
        where: { action: 'ACCOUNT_CREATED' },
      });
      expect(auditCreated.length).toBe(2);

      await request(app.getHttpServer())
        .post(`/accounts/${accRes2.body.id}/deposit`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          amount: 5000,
          currency: 'USD',
          idempotencyKey: randomUUID(),
        })
        .expect(200);

      const auditDeposit = await prisma.auditLog.findMany({
        where: { action: 'FUNDS_DEPOSITED' },
      });
      expect(auditDeposit.length).toBe(1);

      const transferRes = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          idempotencyKey: randomUUID(),
          sourceAccountId: accRes1.body.id,
          destinationAccountId: accRes2.body.id,
          amount: 2000,
          currency: 'USD',
        })
        .expect(201);

      const auditTransfer = await prisma.auditLog.findMany({
        where: { action: 'TRANSFER_POSTED' },
      });
      expect(auditTransfer.length).toBe(1);
      expect(auditTransfer[0]?.resourceId).toBe(transferRes.body.id);

      await request(app.getHttpServer())
        .post(`/transfers/${transferRes.body.id}/reverse`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          reason: 'Audit test reversal',
          idempotencyKey: randomUUID(),
        })
        .expect(200);

      const auditReversal = await prisma.auditLog.findMany({
        where: { action: 'TRANSFER_REVERSED' },
      });
      expect(auditReversal.length).toBe(1);
      expect(auditReversal[0]?.resourceId).toBe(transferRes.body.id);
    });
  });

  describe('6. Security Hardening and Tracing', () => {
    it('should generate and inject x-correlation-id in response headers', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      const correlationHeader = res.headers[CORRELATION_ID_HEADER] as string;
      expect(correlationHeader).toBeDefined();
      expect(correlationHeader.length).toBeGreaterThan(0);
    });

    it('should preserve incoming x-correlation-id in response headers', async () => {
      const customCorrelationId = 'client-custom-req-trace-42';
      const res = await request(app.getHttpServer())
        .get('/health')
        .set(CORRELATION_ID_HEADER, customCorrelationId)
        .expect(200);

      expect(res.headers[CORRELATION_ID_HEADER]).toBe(customCorrelationId);
    });

    it('should set secure HTTP headers via Helmet', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('should enforce rate limiting and return 429 Too Many Requests when threshold is exceeded', async () => {
      let hitRateLimit = false;

      for (let i = 0; i < 115; i++) {
        const res = await request(app.getHttpServer()).get('/health');
        if (res.status === 429) {
          hitRateLimit = true;
          break;
        }
      }

      expect(hitRateLimit).toBe(true);
    });
  });
});
