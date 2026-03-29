import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RequestIdInterceptor } from './common/request-id.interceptor';
import { GlobalExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 1024 * 1024, // 1MB default, overridden by config
      trustProxy: true,
    }),
    { bufferLogs: true },
  );

  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const swaggerEnabled = configService.get<string>('SWAGGER_ENABLED', 'true') === 'true';

  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'api/v',
  });

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('AI Review Service')
      .setDescription('Self-hosted AI code review service for GitLab')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'X-Client-Id', in: 'header' }, 'client-id')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
  logger.log(`Application listening on port ${port}`);
}

bootstrap();
