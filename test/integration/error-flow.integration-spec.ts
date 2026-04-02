import { Test, TestingModule } from '@nestjs/testing';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ClientsConfigService } from '../../src/auth/clients-config.service';
import { GitLabService } from '../../src/gitlab/gitlab.service';
import { ModelService } from '../../src/model/model.service';
import { MODEL_PROVIDER } from '../../src/model/providers/model-provider.interface';
import { RequestIdInterceptor } from '../../src/common/request-id.interceptor';
import { GlobalExceptionFilter } from '../../src/common/http-exception.filter';

const mockClient = {
  client_id: 'test-client',
  api_key: 'test-key',
  client_secret: 'test-secret',
  gitlab_token: 'glpat-test',
  gitlab_base_url: 'https://gitlab.example.com',
  enabled: true,
  allowed_endpoints: ['/api/v1/reviews/run'],
  rate_limit: { requests: 100, per_seconds: 60 },
};

const mockMr = {
  iid: 1,
  title: 'Test MR',
  description: '',
  state: 'opened',
  source_branch: 'feature',
  target_branch: 'main',
  diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'a' },
};

const mockChanges = [
  {
    old_path: 'src/app.ts',
    new_path: 'src/app.ts',
    diff: '@@ -1 +1 @@\n-old\n+new',
    new_file: false,
    deleted_file: false,
    renamed_file: false,
  },
];

const mockVersions = [{ id: 1, base_commit_sha: 'a', head_commit_sha: 'b', start_commit_sha: 'a' }];

const validPayload = {
  api_version: 'v1',
  gitlab: { project_path: 'group/project', mr_iid: 1 },
  review: { mode: 'mr', dry_run: true, profile: 'default' },
};

const authHeaders = {
  authorization: 'Bearer test-key',
  'x-client-id': 'test-client',
};

describe('Error Flow Integration', () => {
  let app: NestFastifyApplication;
  let gitlabService: Record<string, jest.Mock>;
  let modelService: Record<string, jest.Mock>;
  let errorSpy: jest.SpyInstance;

  beforeAll(async () => {
    gitlabService = {
      getMergeRequest: jest.fn().mockResolvedValue(mockMr),
      getMrChanges: jest.fn().mockResolvedValue(mockChanges),
      getDiscussions: jest.fn().mockResolvedValue([]),
      getMrDiffVersions: jest.fn().mockResolvedValue(mockVersions),
      createDiscussion: jest.fn().mockResolvedValue({ id: 'disc-1' }),
      replyToDiscussion: jest.fn(),
    };

    modelService = {
      analyze: jest.fn().mockResolvedValue([]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MODEL_PROVIDER)
      .useValue({ complete: jest.fn() })
      .overrideProvider(ClientsConfigService)
      .useValue({
        getClient: jest.fn().mockReturnValue(mockClient),
        isLoaded: jest.fn().mockReturnValue(true),
        onModuleInit: jest.fn(),
      })
      .overrideProvider(GitLabService)
      .useValue(gitlabService)
      .overrideProvider(ModelService)
      .useValue(modelService)
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

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error');
    // Reset mocks to default success state
    gitlabService.getMergeRequest.mockResolvedValue(mockMr);
    gitlabService.getMrChanges.mockResolvedValue(mockChanges);
    gitlabService.getDiscussions.mockResolvedValue([]);
    gitlabService.getMrDiffVersions.mockResolvedValue(mockVersions);
    modelService.analyze.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GitLab API errors propagate as 500 with logging', () => {
    it('should return 500 and log error when getMergeRequest fails', async () => {
      gitlabService.getMergeRequest.mockRejectedValue(new Error('GitLab API returned 502'));

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/reviews/run',
        headers: authHeaders,
        payload: validPayload,
      });

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.payload);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('GitLab API returned 502'),
        expect.any(String),
      );
    });

    it('should return 500 and log error when getMrChanges fails', async () => {
      gitlabService.getMrChanges.mockRejectedValue(new Error('Connection refused'));

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/reviews/run',
        headers: authHeaders,
        payload: validPayload,
      });

      expect(result.statusCode).toBe(500);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connection refused'),
        expect.any(String),
      );
    });
  });

  describe('model errors propagate as 500 with logging', () => {
    it('should return 500 and log error when model.analyze() throws', async () => {
      modelService.analyze.mockRejectedValue(new Error('Model API returned 500'));

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/reviews/run',
        headers: authHeaders,
        payload: validPayload,
      });

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.payload);
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Model API returned 500'),
        expect.any(String),
      );
    });
  });

  describe('business logic errors return correct HTTP status', () => {
    it('should return 400 when MR is closed', async () => {
      gitlabService.getMergeRequest.mockResolvedValue({ ...mockMr, state: 'closed' });

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/reviews/run',
        headers: authHeaders,
        payload: validPayload,
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.payload);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toContain('closed');
    });

    it('should return 400 when MR is merged', async () => {
      gitlabService.getMergeRequest.mockResolvedValue({ ...mockMr, state: 'merged' });

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/reviews/run',
        headers: authHeaders,
        payload: validPayload,
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.payload);
      expect(body.error.message).toContain('merged');
    });
  });

  describe('error response envelope consistency', () => {
    it('should always include request_id, status, and error fields', async () => {
      gitlabService.getMergeRequest.mockRejectedValue(new Error('fail'));

      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/reviews/run',
        headers: authHeaders,
        payload: validPayload,
      });

      const body = JSON.parse(result.payload);
      expect(body).toHaveProperty('request_id');
      expect(body).toHaveProperty('status', 'error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('retryable');
    });

    it('should have consistent envelope for 400 validation errors', async () => {
      const result = await app.inject({
        method: 'POST',
        url: '/api/v1/reviews/run',
        headers: authHeaders,
        payload: {},
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.payload);
      expect(body.status).toBe('error');
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(typeof body.error.message).toBe('string');
      expect(body.error.retryable).toBe(false);
    });
  });
});
