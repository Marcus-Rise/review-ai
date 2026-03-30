import { Test, TestingModule } from '@nestjs/testing';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ClientsConfigService } from '../../src/auth/clients-config.service';
import { MODEL_PROVIDER } from '../../src/model/providers/model-provider.interface';
import { RequestIdInterceptor } from '../../src/common/request-id.interceptor';
import { GlobalExceptionFilter } from '../../src/common/http-exception.filter';

const validPayload = {
  api_version: 'v1',
  gitlab: {
    base_url: 'https://gitlab.example.com',
    project_path: 'group/project',
    mr_iid: 1,
  },
  review: {
    mode: 'mr',
    dry_run: true,
    profile: 'default',
  },
};

describe('POST /api/v1/reviews/run (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MODEL_PROVIDER)
      .useValue({ complete: jest.fn() })
      .overrideProvider(ClientsConfigService)
      .useValue({
        getClient: jest.fn().mockReturnValue({
          client_id: 'test-client',
          api_key: 'test-key',
          client_secret: 'test-secret',
          gitlab_token: 'glpat-test',
          enabled: true,
          allowed_endpoints: ['/api/v1/reviews/run'],
          rate_limit: { requests: 10, per_seconds: 60 },
        }),
        isLoaded: jest.fn().mockReturnValue(true),
        onModuleInit: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
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
    app.enableVersioning({ type: VersioningType.URI, prefix: 'api/v' });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should reject unauthenticated request', async () => {
    const result = await app.inject({
      method: 'POST',
      url: '/api/v1/reviews/run',
      payload: validPayload,
    });
    expect(result.statusCode).toBe(401);
  });

  it('should reject invalid payload', async () => {
    const result = await app.inject({
      method: 'POST',
      url: '/api/v1/reviews/run',
      headers: {
        authorization: 'Bearer test-key',
        'x-client-id': 'test-client',
      },
      payload: { invalid: true },
    });
    expect(result.statusCode).toBe(400);
  });

  it('should reject invalid api_version', async () => {
    const result = await app.inject({
      method: 'POST',
      url: '/api/v1/reviews/run',
      headers: {
        authorization: 'Bearer test-key',
        'x-client-id': 'test-client',
      },
      payload: { ...validPayload, api_version: 'v99' },
    });
    expect(result.statusCode).toBe(400);
  });

  it('should return X-Request-Id header', async () => {
    const result = await app.inject({
      method: 'GET',
      url: '/api/v1/reviews/help',
    });
    expect(result.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/v1/reviews/help should return help info', async () => {
    const result = await app.inject({
      method: 'GET',
      url: '/api/v1/reviews/help',
    });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.payload);
    expect(body.service).toBe('AI Review Service');
    expect(body.endpoints).toBeDefined();
  });
});
