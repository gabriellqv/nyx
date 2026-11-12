import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AllExceptionsFilter } from '../../common/filters/http-exception.filter';

describe('Observability and Metrics Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('1. Prometheus Metrics Endpoint', () => {
    it('should expose operational and financial metrics in Prometheus text format', async () => {
      const res = await request(app.getHttpServer()).get('/metrics').expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('process_uptime_seconds');
      expect(res.text).toContain('nodejs_heap_used_bytes');
      expect(res.text).toContain('nyx_outbox_pending_events');
      expect(res.text).toContain('nyx_financial_transfers_total');
      expect(res.text).toContain('nyx_financial_payments_total');
      expect(res.text).toContain('nyx_accounts_total');
      expect(res.text).toContain('http_requests_total');
    });
  });

  describe('2. Operational Health Probes', () => {
    it('should respond with 200 OK on liveness probe', async () => {
      const res = await request(app.getHttpServer()).get('/health/live').expect(200);

      expect(res.body.status).toBe('ok');
      expect(typeof res.body.uptime).toBe('number');
    });

    it('should respond with 200 OK on readiness probe when database is reachable', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('ok');
    });
  });
});
