import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

/**
 * Bootstrap function initializing the HTTP application server.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', 'http://localhost:3000');

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port);
  logger.log(`API service successfully listening on port ${port}`);
}

void bootstrap();
