import { Test, TestingModule } from '@nestjs/testing';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from '../../src/app.module';
import { ConfigService } from '@nestjs/config';
import { ClientsConfigService } from '../../src/auth/clients-config.service';

describe('Security headers (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClientsConfigService)
      .useValue({ isLoaded: () => true, loadConfig: jest.fn() })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, def?: unknown) => {
          if (key === 'MODEL_PROVIDER') return 'openai';
          if (key === 'MODEL_NAME') return 'qwen2.5-coder:1.5b';
          if (key === 'MODEL_ENDPOINT') return 'http://localhost:11434';
          if (key === 'LOG_LEVEL') return 'silent';
          if (key === 'APP_ENV') return 'test';
          if (key === 'SWAGGER_ENABLED') return 'false';
          return def;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await app.register(helmet as any, {
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'no-referrer' },
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
      frameguard: { action: 'deny' },
      dnsPrefetchControl: { allow: false },
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should include X-Content-Type-Options: nosniff', async () => {
    const result = await app.inject({ method: 'GET', url: '/healthz' });
    expect(result.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should include X-Frame-Options: DENY', async () => {
    const result = await app.inject({ method: 'GET', url: '/healthz' });
    expect(result.headers['x-frame-options']).toBe('DENY');
  });

  it('should include Strict-Transport-Security', async () => {
    const result = await app.inject({ method: 'GET', url: '/healthz' });
    expect(result.headers['strict-transport-security']).toContain('max-age=63072000');
  });

  it('should include Content-Security-Policy', async () => {
    const result = await app.inject({ method: 'GET', url: '/healthz' });
    expect(result.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('should include Referrer-Policy: no-referrer', async () => {
    const result = await app.inject({ method: 'GET', url: '/healthz' });
    expect(result.headers['referrer-policy']).toBe('no-referrer');
  });

  it('should include X-DNS-Prefetch-Control: off', async () => {
    const result = await app.inject({ method: 'GET', url: '/healthz' });
    expect(result.headers['x-dns-prefetch-control']).toBe('off');
  });
});
