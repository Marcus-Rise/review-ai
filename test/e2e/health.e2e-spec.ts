import { Test, TestingModule } from '@nestjs/testing';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';

describe('Health endpoints (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  it('GET /readyz should return readiness status', async () => {
    const result = await app.inject({ method: 'GET', url: '/readyz' });
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.payload);
    expect(body.status).toBeDefined();
    expect(body.checks).toBeDefined();
  });
});
