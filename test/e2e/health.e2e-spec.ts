import { Test, TestingModule } from '@nestjs/testing';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';
import { ConfigService } from '@nestjs/config';
import { ClientsConfigService } from '../../src/auth/clients-config.service';

describe('Health endpoints (e2e)', () => {
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
          if (key === 'LOG_LEVEL') return 'silent';
          if (key === 'APP_ENV') return 'test';
          return def;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz should return 200', async () => {
    const result = await app.inject({ method: 'GET', url: '/healthz' });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.payload);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /readyz should return 200 when all checks pass', async () => {
    const result = await app.inject({ method: 'GET', url: '/readyz' });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.payload);
    expect(body.status).toBe('ready');
    expect(body.checks.clients_loaded).toBe(true);
    expect(body.checks.model_provider_configured).toBe(true);
    expect(body.checks.model_name_configured).toBe(true);
  });
});

describe('Health /readyz — not ready (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ClientsConfigService)
      .useValue({ isLoaded: () => false, loadConfig: jest.fn() })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, def?: unknown) => {
          if (key === 'LOG_LEVEL') return 'silent';
          if (key === 'APP_ENV') return 'test';
          return def;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /readyz should return 503 when checks fail', async () => {
    const result = await app.inject({ method: 'GET', url: '/readyz' });
    expect(result.statusCode).toBe(503);
    const body = JSON.parse(result.payload);
    expect(body.status).toBe('not_ready');
    expect(body.checks.clients_loaded).toBe(false);
    expect(body.checks.model_provider_configured).toBe(false);
    expect(body.checks.model_name_configured).toBe(false);
  });
});
