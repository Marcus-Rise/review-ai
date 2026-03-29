import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ReviewModule } from './review/review.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL', 'info'),
          transport:
            config.get<string>('APP_ENV', 'development') === 'development'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers["x-request-signature"]',
              'req.body.gitlab.token',
            ],
            censor: '[REDACTED]',
          },
        },
      }),
    }),
    AuthModule,
    HealthModule,
    ReviewModule,
    RateLimitModule,
  ],
})
export class AppModule {}
