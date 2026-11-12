import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class MetricsService {
  private httpRequestsCount = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  incrementHttpRequest(method: string, statusCode: number): void {
    const key = `${method.toUpperCase()}_${statusCode}`;
    const current = this.httpRequestsCount.get(key) ?? 0;
    this.httpRequestsCount.set(key, current + 1);
  }

  async getPrometheusMetrics(): Promise<string> {
    const mem = process.memoryUsage();
    const uptime = process.uptime();

    // Query domain metrics from database
    const pendingOutboxCount = await this.prisma.outboxEvent.count({
      where: { status: 'pending' },
    });
    const totalTransfers = await this.prisma.transfer.count();
    const totalPayments = await this.prisma.payment.count();
    const totalAccounts = await this.prisma.account.count();

    const lines: string[] = [
      '# HELP process_uptime_seconds The total uptime of the process in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime.toFixed(2)}`,
      '',
      '# HELP nodejs_heap_used_bytes Total heap memory currently in use in bytes.',
      '# TYPE nodejs_heap_used_bytes gauge',
      `nodejs_heap_used_bytes ${mem.heapUsed}`,
      '',
      '# HELP nodejs_heap_size_total_bytes Total allocated heap memory in bytes.',
      '# TYPE nodejs_heap_size_total_bytes gauge',
      `nodejs_heap_size_total_bytes ${mem.heapTotal}`,
      '',
      '# HELP nyx_outbox_pending_events Number of pending transactional outbox events awaiting dispatch.',
      '# TYPE nyx_outbox_pending_events gauge',
      `nyx_outbox_pending_events ${pendingOutboxCount}`,
      '',
      '# HELP nyx_financial_transfers_total Total number of posted financial transfers.',
      '# TYPE nyx_financial_transfers_total counter',
      `nyx_financial_transfers_total ${totalTransfers}`,
      '',
      '# HELP nyx_financial_payments_total Total number of processed incoming payments.',
      '# TYPE nyx_financial_payments_total counter',
      `nyx_financial_payments_total ${totalPayments}`,
      '',
      '# HELP nyx_accounts_total Total number of registered customer financial accounts.',
      '# TYPE nyx_accounts_total gauge',
      `nyx_accounts_total ${totalAccounts}`,
      '',
      '# HELP http_requests_total Total HTTP requests handled by the API.',
      '# TYPE http_requests_total counter',
    ];

    if (this.httpRequestsCount.size === 0) {
      lines.push('http_requests_total{method="GET",status="200"} 0');
    } else {
      for (const [key, count] of this.httpRequestsCount.entries()) {
        const [method, status] = key.split('_');
        lines.push(`http_requests_total{method="${method}",status="${status}"} ${count}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }
}
