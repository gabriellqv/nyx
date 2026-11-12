import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, randomBytes } from 'node:crypto';
import type {
  RegisterWebhookEndpointRequest,
  WebhookEndpointResponse,
  WebhookDeliveryResponse,
} from '@nyx/contracts';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class WebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async registerEndpoint(
    dto: RegisterWebhookEndpointRequest,
  ): Promise<WebhookEndpointResponse & { secret: string }> {
    const id = randomUUID();
    const secret = dto.secret ?? randomBytes(24).toString('hex');

    const created = await this.prisma.webhookEndpoint.create({
      data: {
        id,
        url: dto.url,
        secret,
        events: dto.events,
        status: 'active',
        description: dto.description ?? null,
      },
    });

    return {
      id: created.id,
      url: created.url,
      events: created.events,
      status: created.status as 'active' | 'disabled',
      description: created.description,
      secret: created.secret,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async listEndpoints(): Promise<WebhookEndpointResponse[]> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return endpoints.map(ep => ({
      id: ep.id,
      url: ep.url,
      events: ep.events,
      status: ep.status as 'active' | 'disabled',
      description: ep.description,
      createdAt: ep.createdAt.toISOString(),
      updatedAt: ep.updatedAt.toISOString(),
    }));
  }

  async getEndpoint(id: string): Promise<WebhookEndpointResponse> {
    const ep = await this.prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!ep) {
      throw new NotFoundException(`Webhook endpoint ${id} not found`);
    }

    return {
      id: ep.id,
      url: ep.url,
      events: ep.events,
      status: ep.status as 'active' | 'disabled',
      description: ep.description,
      createdAt: ep.createdAt.toISOString(),
      updatedAt: ep.updatedAt.toISOString(),
    };
  }

  async deleteEndpoint(id: string): Promise<void> {
    const ep = await this.prisma.webhookEndpoint.findUnique({ where: { id } });
    if (!ep) {
      throw new NotFoundException(`Webhook endpoint ${id} not found`);
    }
    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  async listDeliveries(endpointId?: string, limit = 50): Promise<WebhookDeliveryResponse[]> {
    const where = endpointId ? { endpointId } : {};
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return deliveries.map(d => ({
      id: d.id,
      endpointId: d.endpointId,
      outboxEventId: d.outboxEventId,
      statusCode: d.statusCode,
      status: d.status as 'pending' | 'success' | 'failed',
      attempts: d.attempts,
      durationMs: d.durationMs,
      responseBody: d.responseBody,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}
