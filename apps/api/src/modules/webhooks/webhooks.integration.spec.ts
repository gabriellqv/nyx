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
  const requestCounts = new Map<string, number>();
  let receivedRequests: Array<{
    headers: http.IncomingHttpHeaders;
    body: string;
    path: string;
  }> = [];

  beforeAll(async () => {
    // Start temporary HTTP server to receive webhook dispatches
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });
      req.on('end', () => {
        receivedRequests.push({ headers: req.headers, body, path: req.url ?? '/' });
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        const count = (requestCounts.get(path) ?? 0) + 1;
        requestCounts.set(path, count);
        const statusCode =
          path === '/redirect' ? 302 : path === '/fail-once' && count === 1 ? 503 : 200;
        const respond = () => {
          res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            ...(path === '/redirect'
              ? { Location: 'http://169.254.169.254/latest/meta-data/' }
              : {}),
          });
          res.end(JSON.stringify({ received: true }));
        };
        const delay = Number(new URL(req.url ?? '/', 'http://localhost').searchParams.get('delay'));
        if (delay > 0) {
          setTimeout(respond, delay);
        } else {
          respond();
        }
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
    requestCounts.clear();
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhookEndpoint.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.$executeRaw`TRUNCATE TABLE "ledger_entries", "ledger_transactions"`;
    await prisma.transferReversal.deleteMany();
    await prisma.deposit.deleteMany();
    await prisma.transfer.deleteMany();
    await prisma.account.deleteMany();
    await prisma.customer.deleteMany();
  });

  describe('1. Webhook Endpoint Management', () => {
    it('should reject webhook URLs that resolve to link-local infrastructure', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: 'http://169.254.169.254/latest/meta-data/',
          events: ['*'],
        })
        .expect(400);
    });

    it('should not follow redirects returned by a webhook endpoint', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: mockServerUrl.replace('/webhook-target', '/redirect'),
          events: ['transfer.posted'],
        })
        .expect(201);

      const event = await prisma.outboxEvent.create({
        data: {
          id: randomUUID(),
          eventType: 'transfer.posted',
          aggregateType: 'transfer',
          aggregateId: randomUUID(),
          payload: JSON.stringify({ test: 'no redirect' }),
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        },
      });

      await request(app.getHttpServer())
        .post('/webhooks/dispatch')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(requestCounts.get('/redirect')).toBe(1);
      const delivery = await prisma.webhookDelivery.findFirst({
        where: { outboxEventId: event.id },
      });
      expect(delivery?.statusCode).toBe(302);
      expect(delivery?.status).toBe('failed');
    });

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

      const storedEndpoint = await prisma.webhookEndpoint.findUnique({
        where: { id: res.body.id },
      });
      expect(storedEndpoint?.secret).not.toBe(res.body.secret);
      expect(storedEndpoint?.secret).toMatch(/^enc:v1:/);
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

    it('should not dispatch the same claimed event concurrently', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: `${mockServerUrl}?delay=150`,
          events: ['transfer.posted'],
        })
        .expect(201);

      await prisma.outboxEvent.create({
        data: {
          id: randomUUID(),
          eventType: 'transfer.posted',
          aggregateType: 'transfer',
          aggregateId: randomUUID(),
          payload: JSON.stringify({ test: 'single claim' }),
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        },
      });

      const responses = await Promise.all(
        Array.from({ length: 2 }, () =>
          request(app.getHttpServer())
            .post('/webhooks/dispatch')
            .set('Authorization', `Bearer ${adminToken}`),
        ),
      );

      expect(responses.every(response => response.status === 200)).toBe(true);
      expect(receivedRequests).toHaveLength(1);
    });

    it('should reclaim an outbox event after a dispatcher lease expires', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/endpoints')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: mockServerUrl, events: ['transfer.posted'] })
        .expect(201);

      const event = await prisma.outboxEvent.create({
        data: {
          id: randomUUID(),
          eventType: 'transfer.posted',
          aggregateType: 'transfer',
          aggregateId: randomUUID(),
          payload: JSON.stringify({ test: 'expired lease' }),
          status: 'processing',
          retryCount: 0,
          maxRetries: 3,
          lockedAt: new Date(Date.now() - 180_000),
          lockedBy: 'worker-that-crashed',
        },
      });

      await request(app.getHttpServer())
        .post('/webhooks/dispatch')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const reclaimed = await prisma.outboxEvent.findUnique({ where: { id: event.id } });
      expect(receivedRequests).toHaveLength(1);
      expect(reclaimed?.status).toBe('published');
      expect(reclaimed?.lockedBy).toBeNull();
    });

    it('should retry only failed endpoints when a webhook event has partial success', async () => {
      const successUrl = mockServerUrl.replace('/webhook-target', '/always-success');
      const failOnceUrl = `${mockServerUrl.replace('/webhook-target', '')}/fail-once`;

      const registered: Array<{ id: string }> = [];
      for (const url of [successUrl, failOnceUrl]) {
        const response = await request(app.getHttpServer())
          .post('/webhooks/endpoints')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ url, events: ['transfer.posted'] })
          .expect(201);
        registered.push(response.body as { id: string });
      }

      const event = await prisma.outboxEvent.create({
        data: {
          id: randomUUID(),
          eventType: 'transfer.posted',
          aggregateType: 'transfer',
          aggregateId: randomUUID(),
          payload: JSON.stringify({ test: 'partial retry' }),
          status: 'pending',
          retryCount: 0,
          maxRetries: 3,
        },
      });

      await request(app.getHttpServer())
        .post('/webhooks/dispatch')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { nextRetryAt: new Date(Date.now() - 1000) },
      });

      await request(app.getHttpServer())
        .post('/webhooks/dispatch')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(requestCounts.get('/always-success')).toBe(1);
      expect(requestCounts.get('/fail-once')).toBe(2);
      const deliveries = await prisma.webhookDelivery.findMany({
        where: { outboxEventId: event.id },
        orderBy: { endpointId: 'asc' },
      });
      expect(deliveries).toHaveLength(2);
      expect(deliveries.map(delivery => delivery.attempts).sort()).toEqual([1, 2]);

      const failedRequests = receivedRequests.filter(request =>
        request.path.startsWith('/fail-once'),
      );
      const failedDelivery = deliveries.find(delivery => delivery.endpointId === registered[1]?.id);
      expect(failedRequests).toHaveLength(2);
      expect(failedRequests[0]?.headers['x-nyx-delivery']).toBe(failedDelivery?.id);
      expect(failedRequests[1]?.headers['x-nyx-delivery']).toBe(failedDelivery?.id);
    });
  });
});
