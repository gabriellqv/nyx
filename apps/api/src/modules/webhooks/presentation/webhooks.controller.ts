import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import {
  registerWebhookEndpointSchema,
  type RegisterWebhookEndpointRequest,
  type WebhookEndpointResponse,
  type WebhookDeliveryResponse,
} from '@nyx/contracts';
import { WebhookService } from '../webhook.service';
import { WebhookDispatcher, DispatchResult } from '../webhook-dispatcher.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly webhookDispatcher: WebhookDispatcher,
  ) {}

  @Post('endpoints')
  @HttpCode(HttpStatus.CREATED)
  async registerEndpoint(
    @Body() body: unknown,
  ): Promise<WebhookEndpointResponse & { secret: string }> {
    const parseResult = registerWebhookEndpointSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException(parseResult.error.format());
    }
    return this.webhookService.registerEndpoint(parseResult.data as RegisterWebhookEndpointRequest);
  }

  @Get('endpoints')
  async listEndpoints(): Promise<WebhookEndpointResponse[]> {
    return this.webhookService.listEndpoints();
  }

  @Get('endpoints/:id')
  async getEndpoint(@Param('id') id: string): Promise<WebhookEndpointResponse> {
    return this.webhookService.getEndpoint(id);
  }

  @Delete('endpoints/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEndpoint(@Param('id') id: string): Promise<void> {
    return this.webhookService.deleteEndpoint(id);
  }

  @Get('deliveries')
  async listDeliveries(
    @Query('endpointId') endpointId?: string,
  ): Promise<WebhookDeliveryResponse[]> {
    return this.webhookService.listDeliveries(endpointId);
  }

  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatch(): Promise<{ processedCount: number; results: DispatchResult[] }> {
    return this.webhookDispatcher.dispatchPending();
  }
}
