import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { validateEnvironment } from './config/configuration';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { CustomersModule } from './modules/customers/customers.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { ObservabilityMiddleware } from './modules/observability/observability.middleware';
import { JwtAuthGuard } from './modules/auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/infrastructure/guards/roles.guard';

/**
 * Root application module orchestrating domain modules and core infrastructure.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuditModule,
    OutboxModule,
    ObservabilityModule,
    HealthModule,
    AuthModule,
    CustomersModule,
    LedgerModule,
    AccountsModule,
    TransfersModule,
    PaymentsModule,
    WebhooksModule,
    ReconciliationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware, ObservabilityMiddleware).forRoutes('*');
  }
}
