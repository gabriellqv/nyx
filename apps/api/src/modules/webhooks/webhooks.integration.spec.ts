import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID, createHmac } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';
import { createTestAccessToken } from '../../testing/auth-test-helper';

describe('Webhooks and Transactional Outbox Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let mockServer: http.Server;
  let mockServerUrl: string;
  let receivedRequests: Array<{
    headers: http.IncomingHttpHeaders;
    body: string;
  }> = [];

  beforeAll(async () => {
    // Start temporary HTTP server to receive webhook dispatches
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({ headers: req.headers, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });

    await new Promise<void>(resolve => {
      mockServer.listen(0, '127.0.0.1', () => {
        const address = mockServer.address() as AddressInfo;
        mockServerUrl = `http://127.0.0.1:${address.port}/webhook-target`;
        resolve();
      });
    });

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
    await new Promise<void>(resolve => mockServer.close(() => resolve()));
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    receivedRequests = [];
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhookEndpoint.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.$executeRaw`TRUNCATE TABLE "ledger_entries", "ledger_transactions"`;
    await prisma.transfer.deleteMany();
    await prisma.account.deleteMany();
    await prisma.customer.deleteMany();
  });

  describe('1. Webhook Endpoint Management', () => {
    it('should register a webhook endpoint and return its signing secret', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: mockServerUrl,
          events: ['transfer.posted', 'payment.completed'],
          description: 'Local test consumer',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.url).toBe(mockServerUrl);
      expect(res.body.secret).toBeDefined();
      expect(res.body.secret.length).toBeGreaterThanOrEqual(16);
      expect(res.body.status).toBe('active');
    });

    it('should list registered webhook endpoints', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: mockServerUrl,
          events: ['*'],
        });

      const res = await request(app.getHttpServer())
        .get('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0]?.url).toBe(mockServerUrl);
    });
  });

  describe('2. Outbox Persistence and Webhook Dispatch with HMAC Signing', () => {
    it('should dispatch outbox event, verify HMAC-SHA256 signature, and mark outbox as published', async () => {
      const secret = 'my-super-secret-key-for-webhook-signing-1234';

      // 1. Register subscriber endpoint
      const endpointRes = await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: mockServerUrl,
          secret,
          events: ['transfer.posted'],
        })
        .expect(201);

      // 2. Setup financial customer and accounts
      const custId = randomUUID();
      await prisma.customer.create({
        data: {
          id: custId,
          name: 'Webhook Customer',
          email: 'webhook@nyx.local',
          documentNumber: `DOC-WH-${Date.now()}`,
          status: 'active',
        },
      });

      const accAId = randomUUID();
      const accBId = randomUUID();
      await prisma.account.create({
        data: {
          id: accAId,
          customerId: custId,
          accountNumber: 'ACC-WH-A',
          currency: 'USD',
          balance: 50000n,
          status: 'active',
        },
      });
      await prisma.account.create({
        data: {
          id: accBId,
          customerId: custId,
          accountNumber: 'ACC-WH-B',
          currency: 'USD',
          balance: 0n,
          status: 'active',
        },
      });

      // 3. Execute a transfer, which creates an OutboxEvent atomically
      const transferRes = await request(app.getHttpServer())
        .post('/transfers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          idempotencyKey: randomUUID(),
          sourceAccountId: accAId,
          destinationAccountId: accBId,
          amount: 2500,
          currency: 'USD',
        })
        .expect(201);

      // Verify outbox event exists with status pending
      const outboxBefore = await prisma.outboxEvent.findFirst({
        where: { eventType: 'transfer.posted', aggregateId: transferRes.body.id },
      });
      expect(outboxBefore).toBeDefined();
      expect(outboxBefore?.status).toBe('pending');

      // 4. Trigger webhook dispatcher
      const dispatchRes = await request(app.getHttpServer())
        .post('/webhooks/dispatch')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(dispatchRes.body.processedCount).toBeGreaterThanOrEqual(1);

      // 5. Verify the HTTP receiver captured the dispatch
      expect(receivedRequests.length).toBe(1);
      const incoming = receivedRequests[0];
      expect(incoming).toBeDefined();

      // Verify headers
      expect(incoming?.headers['x-nyx-event']).toBe('transfer.posted');
      expect(incoming?.headers['x-nyx-delivery']).toBeDefined();
      expect(incoming?.headers['x-nyx-timestamp']).toBeDefined();

      const signatureHeader = incoming?.headers['x-nyx-signature'] as string;
      expect(signatureHeader).toBeDefined();

      // Verify HMAC-SHA256 signature
      const timestampMatch = signatureHeader.match(/t=(\d+),v1=([a-f0-9]+)/);
      expect(timestampMatch).not.toBeNull();
      const [, receivedTimestamp, receivedDigest] = timestampMatch!;

      const expectedDigest = createHmac('sha256', secret)
        .update(`${receivedTimestamp}.${incoming?.body}`)
        .digest('hex');

      expect(receivedDigest).toBe(expectedDigest);

      // 6. Verify outbox event is marked published
      const outboxAfter = await prisma.outboxEvent.findUnique({
        where: { id: outboxBefore!.id },
      });
      expect(outboxAfter?.status).toBe('published');
      expect(outboxAfter?.processedAt).toBeDefined();

      // 7. Verify delivery log recorded in database
      const deliveries = await prisma.webhookDelivery.findMany({
        where: { endpointId: endpointRes.body.id },
      });
      expect(deliveries.length).toBe(1);
      expect(deliveries[0]?.status).toBe('success');
      expect(deliveries[0]?.statusCode).toBe(200);
    });
  });

  describe('3. Retry and Failure Handling', () => {
    it('should increment retryCount and schedule nextRetryAt when endpoint fails', async () => {
      // Register an endpoint with an unreachable port
      const endpointRes = await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'http://127.0.0.1:59999/unreachable',
          events: ['transfer.posted'],
        })
        .expect(201);

      // Manually create a pending outbox event
      const eventId = randomUUID();
      await prisma.outboxEvent.create({
        data: {
          id: eventId,
          eventType: 'transfer.posted',
          aggregateType: 'transfer',
          aggregateId: randomUUID(),
          payload: JSON.stringify({ test: 'retry' }),
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        },
      });

      // Dispatch
      await request(app.getHttpServer())
        .post('/webhooks/dispatch')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify outbox event was marked pending with incremented retry count
      const eventAfter = await prisma.outboxEvent.findUnique({ where: { id: eventId } });
      expect(eventAfter?.status).toBe('pending');
      expect(eventAfter?.retryCount).toBe(1);
      expect(eventAfter?.errorMessage).toContain('One or more webhook deliveries failed');

      // Verify delivery record recorded failure
      const delivery = await prisma.webhookDelivery.findFirst({
        where: { endpointId: endpointRes.body.id },
      });
      expect(delivery).toBeDefined();
      expect(delivery?.status).toBe('failed');
    });
  });
});
