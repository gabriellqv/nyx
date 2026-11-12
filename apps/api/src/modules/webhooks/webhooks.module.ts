import { Module } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookDispatcher } from './webhook-dispatcher.service';
import { WebhooksController } from './presentation/webhooks.controller';

@Module({
  controllers: [WebhooksController],
  providers: [WebhookService, WebhookDispatcher],
  exports: [WebhookService, WebhookDispatcher],
})
export class WebhooksModule {}
