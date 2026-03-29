import { BadRequestException } from '@nestjs/common';
import { ReviewService } from '../../src/review/review.service';
import { ContextBuilderService } from '../../src/review/context-builder.service';
import { ModelService } from '../../src/model/model.service';
import { DecisionEngineService } from '../../src/publish/decision-engine.service';
import { PublisherService } from '../../src/publish/publisher.service';
import { RateLimitService } from '../../src/rate-limit/rate-limit.service';
import { IdempotencyService } from '../../src/rate-limit/idempotency.service';
import { ClientConfig } from '../../src/auth/clients-config.interface';
import { RunReviewDto } from '../../src/review/dto/run-review.dto';

const mockClient: ClientConfig = {
  client_id: 'c1',
  api_key: 'key',
  client_secret: 'secret',
  enabled: true,
  allowed_endpoints: [],
  rate_limit: { requests: 10, per_seconds: 60 },
};

function makeDto(
  overrides: Partial<{ project_path: string; project_id: number }> = {},
): RunReviewDto {
  return {
    api_version: 'v1',
    gitlab: {
      base_url: 'https://gitlab.example.com',
      mr_iid: 1,
      token: 'token',
      ...overrides,
    },
    review: {
      mode: 'mr',
      dry_run: false,
      profile: 'default',
    },
  } as RunReviewDto;
}

describe('ReviewService', () => {
  let service: ReviewService;
  let rateLimitService: jest.Mocked<RateLimitService>;

  beforeEach(() => {
    rateLimitService = {
      checkLimit: jest.fn().mockReturnValue({ allowed: true }),
    } as unknown as jest.Mocked<RateLimitService>;

    service = new ReviewService(
      {} as ContextBuilderService,
      {} as ModelService,
      {} as DecisionEngineService,
      {} as PublisherService,
      rateLimitService,
      { getCached: jest.fn(), store: jest.fn() } as unknown as IdempotencyService,
    );
  });

  it('should throw BadRequestException before consuming rate limit when project identification is missing', async () => {
    const dto = makeDto(); // no project_path, no project_id

    await expect(service.runReview(dto, 'req-1', mockClient)).rejects.toThrow(BadRequestException);
    expect(rateLimitService.checkLimit).not.toHaveBeenCalled();
  });

  it('should check rate limit when project_path is provided', async () => {
    const contextBuilder = {
      build: jest.fn().mockResolvedValue({
        mr_title: 'T',
        mr_description: '',
        source_branch: 'f',
        target_branch: 'm',
        changes: [],
        existing_discussions: [],
        diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'a' },
        review_profile: 'default',
      }),
    } as unknown as ContextBuilderService;
    const model = { analyze: jest.fn().mockResolvedValue([]) } as unknown as ModelService;
    const decisionEngine = {
      decide: jest.fn().mockReturnValue([]),
    } as unknown as DecisionEngineService;
    const publisher = {
      publish: jest.fn().mockResolvedValue({ results: [], reviewActions: [] }),
    } as unknown as PublisherService;

    const svc = new ReviewService(
      contextBuilder,
      model,
      decisionEngine,
      publisher,
      rateLimitService,
      { getCached: jest.fn(), store: jest.fn() } as unknown as IdempotencyService,
    );

    const dto = makeDto({ project_path: 'group/project' });
    await svc.runReview(dto, 'req-1', mockClient);

    expect(rateLimitService.checkLimit).toHaveBeenCalledTimes(1);
  });

  it('should throw BadRequestException when no GitLab token is provided', async () => {
    const dto = makeDto({ project_path: 'group/project' });
    dto.gitlab.token = '';

    await expect(service.runReview(dto, 'req-1', mockClient)).rejects.toThrow(BadRequestException);
    await expect(service.runReview(dto, 'req-1', mockClient)).rejects.toThrow(/token/i);
  });

  it('should report partial failures with status "partial" and errors array', async () => {
    const contextBuilder = {
      build: jest.fn().mockResolvedValue({
        mr_title: 'T',
        mr_description: '',
        source_branch: 'f',
        target_branch: 'm',
        changes: [],
        existing_discussions: [],
        diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'a' },
        review_profile: 'default',
      }),
    } as unknown as ContextBuilderService;
    const model = {
      analyze: jest.fn().mockResolvedValue([]),
    } as unknown as ModelService;
    const decisionEngine = {
      decide: jest.fn().mockReturnValue([]),
    } as unknown as DecisionEngineService;
    const publisher = {
      publish: jest.fn().mockResolvedValue({
        results: [
          {
            action: {
              decision: 'new_discussion',
              finding: {
                file_path: 'a.ts',
                line: 1,
                category: 'correctness',
                severity: 'high',
                confidence: 'high',
                risk_statement: 'r',
                rationale: 'r',
                is_inline_comment: true,
                is_suggestion_safe: false,
              },
            },
            success: true,
          },
          {
            action: {
              decision: 'new_discussion',
              finding: {
                file_path: 'b.ts',
                line: 5,
                category: 'correctness',
                severity: 'high',
                confidence: 'high',
                risk_statement: 'r2',
                rationale: 'r2',
                is_inline_comment: true,
                is_suggestion_safe: false,
              },
            },
            success: false,
            error: 'GitLab 500',
          },
        ],
        reviewActions: [{ type: 'new_discussion', path: 'a.ts', line: 1, reason: 'New' }],
      }),
    } as unknown as PublisherService;

    const svc = new ReviewService(
      contextBuilder,
      model,
      decisionEngine,
      publisher,
      rateLimitService,
      { getCached: jest.fn(), store: jest.fn() } as unknown as IdempotencyService,
    );

    const dto = makeDto({ project_path: 'group/project' });
    const response = await svc.runReview(dto, 'req-1', mockClient);

    expect(response.status).toBe('partial');
    expect(response.errors).toBeDefined();
    expect(response.errors).toHaveLength(1);
    expect(response.errors![0]).toEqual(
      expect.objectContaining({ path: 'b.ts', line: 5, error: 'GitLab 500' }),
    );
  });

  it('should report status "error" when all non-skip actions fail', async () => {
    const contextBuilder = {
      build: jest.fn().mockResolvedValue({
        mr_title: 'T',
        mr_description: '',
        source_branch: 'f',
        target_branch: 'm',
        changes: [],
        existing_discussions: [],
        diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'a' },
        review_profile: 'default',
      }),
    } as unknown as ContextBuilderService;
    const model = { analyze: jest.fn().mockResolvedValue([]) } as unknown as ModelService;
    const decisionEngine = {
      decide: jest.fn().mockReturnValue([]),
    } as unknown as DecisionEngineService;
    const publisher = {
      publish: jest.fn().mockResolvedValue({
        results: [
          {
            action: {
              decision: 'new_discussion',
              finding: {
                file_path: 'a.ts',
                line: 1,
                category: 'correctness',
                severity: 'high',
                confidence: 'high',
                risk_statement: 'r',
                rationale: 'r',
                is_inline_comment: true,
                is_suggestion_safe: false,
              },
            },
            success: false,
            error: 'GitLab 500',
          },
        ],
        reviewActions: [],
      }),
    } as unknown as PublisherService;

    const svc = new ReviewService(
      contextBuilder,
      model,
      decisionEngine,
      publisher,
      rateLimitService,
      { getCached: jest.fn(), store: jest.fn() } as unknown as IdempotencyService,
    );

    const dto = makeDto({ project_path: 'group/project' });
    const response = await svc.runReview(dto, 'req-1', mockClient);

    expect(response.status).toBe('error');
    expect(response.errors).toHaveLength(1);
  });

  it('should report status "ok" and empty errors when all actions succeed', async () => {
    const contextBuilder = {
      build: jest.fn().mockResolvedValue({
        mr_title: 'T',
        mr_description: '',
        source_branch: 'f',
        target_branch: 'm',
        changes: [],
        existing_discussions: [],
        diff_refs: { base_sha: 'a', head_sha: 'b', start_sha: 'a' },
        review_profile: 'default',
      }),
    } as unknown as ContextBuilderService;
    const model = {
      analyze: jest.fn().mockResolvedValue([]),
    } as unknown as ModelService;
    const decisionEngine = {
      decide: jest.fn().mockReturnValue([]),
    } as unknown as DecisionEngineService;
    const publisher = {
      publish: jest.fn().mockResolvedValue({
        results: [
          {
            action: {
              decision: 'new_discussion',
              finding: { file_path: 'a.ts', line: 1 },
            },
            success: true,
          },
        ],
        reviewActions: [{ type: 'new_discussion', path: 'a.ts', line: 1, reason: 'New' }],
      }),
    } as unknown as PublisherService;

    const svc = new ReviewService(
      contextBuilder,
      model,
      decisionEngine,
      publisher,
      rateLimitService,
      { getCached: jest.fn(), store: jest.fn() } as unknown as IdempotencyService,
    );

    const dto = makeDto({ project_path: 'group/project' });
    const response = await svc.runReview(dto, 'req-1', mockClient);

    expect(response.status).toBe('ok');
    expect(response.errors).toEqual([]);
  });
});
