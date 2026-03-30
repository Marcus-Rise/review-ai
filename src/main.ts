import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RequestIdInterceptor } from './common/request-id.interceptor';
import { TimeoutInterceptor } from './common/timeout.interceptor';
import { GlobalExceptionFilter } from './common/http-exception.filter';

async function bootstrap() {
  const bodyLimit = parseInt(process.env.REQUEST_BODY_LIMIT || '', 10) || 1024 * 1024;

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit,
      trustProxy: true,
    }),
    { bufferLogs: true },
  );

  const logger = app.get(Logger);
  app.useLogger(logger);

  const appConfigService = app.get(ConfigService);
  const port = appConfigService.get<number>('PORT', 3000);
  const swaggerEnabled = appConfigService.get<string>('SWAGGER_ENABLED', 'true') === 'true';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(helmet as any, {
    contentSecurityPolicy: swaggerEnabled
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'"],
          },
        }
      : undefined,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    dnsPrefetchControl: { allow: false },
  });

  app.useGlobalInterceptors(new RequestIdInterceptor(), app.get(TimeoutInterceptor));
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
