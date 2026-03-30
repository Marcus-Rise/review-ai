import { Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ContextBuilderService } from './context-builder.service';
import { ModelService } from '../model/model.service';
import { DecisionEngineService } from '../publish/decision-engine.service';
import { PublisherService } from '../publish/publisher.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { IdempotencyService } from '../rate-limit/idempotency.service';
import { GitLabConfig, ReviewResponse } from '../common/interfaces';
import { ClientConfig } from '../auth/clients-config.interface';
import { sanitizeUserFocus } from '../common/sanitize.util';
import { RunReviewDto } from './dto/run-review.dto';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly contextBuilder: ContextBuilderService,
    private readonly model: ModelService,
    private readonly decisionEngine: DecisionEngineService,
    private readonly publisher: PublisherService,
    private readonly rateLimitService: RateLimitService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async runReview(
    dto: RunReviewDto,
    requestId: string,
    client: ClientConfig,
    idempotencyKey?: string,
  ): Promise<ReviewResponse> {
    // Idempotency check — scope key by client_id to prevent cross-client cache collisions
    const scopedIdempotencyKey = idempotencyKey
      ? `${client.client_id}:${idempotencyKey}`
      : undefined;
    if (scopedIdempotencyKey) {
      const cached = this.idempotencyService.getCached(scopedIdempotencyKey);
      if (cached) {
        this.logger.log(`Returning cached response for idempotency key: ${idempotencyKey}`);
        return cached as ReviewResponse;
      }
    }

    // Validate project identification
    if (!dto.gitlab.project_path && !dto.gitlab.project_id) {
      throw new BadRequestException('Either project_path or project_id is required');
    }

    // Rate limit check
    const projectPath = dto.gitlab.project_path || String(dto.gitlab.project_id);
    const rateLimit = this.rateLimitService.checkLimit(
      client.client_id,
      projectPath,
      dto.gitlab.mr_iid,
      client.rate_limit.requests,
      client.rate_limit.per_seconds,
    );

    if (!rateLimit.allowed) {
      throw new HttpException(
        `Rate limit exceeded. Retry after ${rateLimit.retryAfterSeconds} seconds`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const gitlabConfig: GitLabConfig = {
      base_url: dto.gitlab.base_url,
      project_path: dto.gitlab.project_path,
      project_id: dto.gitlab.project_id,
      mr_iid: dto.gitlab.mr_iid,
      token: client.gitlab_token,
      base_sha: dto.gitlab.base_sha,
      head_sha: dto.gitlab.head_sha,
    };

    const userFocus = sanitizeUserFocus(dto.review.user_focus);
    const warnings: string[] = [];

    if (dto.review.user_focus && !userFocus) {
      warnings.push('user_focus was discarded due to sanitization');
    }

    // Build review context
    this.logger.log(`Starting review for MR !${dto.gitlab.mr_iid}`);
    const packet = await this.contextBuilder.build(gitlabConfig, dto.review.profile, userFocus);

    if (packet.warnings?.length) {
      warnings.push(...packet.warnings);
    }

    // Call model
    const findings = await this.model.analyze(packet);
    this.logger.log(`Model returned ${findings.length} findings`);

    // Run decision engine
    const actions = this.decisionEngine.decide(findings, packet.existing_discussions);

    // Publish
    const { results, reviewActions } = await this.publisher.publish(
      actions,
      gitlabConfig,
      packet.diff_refs,
      dto.review.dry_run,
      packet.changes,
    );

    const failedResults = results.filter((r) => !r.success && r.action.decision !== 'skip');
    const errors = failedResults.map((r) => ({
      path: r.action.finding.file_path,
      line: r.action.finding.line,
      error: r.error || 'Unknown error',
    }));

    const response: ReviewResponse = {
      request_id: requestId,
      status:
        errors.length > 0
          ? results.some((r) => r.success && r.action.decision !== 'skip')
            ? 'partial'
            : 'error'
          : 'ok',
      summary: {
        findings_considered: findings.length,
        actions_published: results.filter(
          (r) => r.success && r.action.decision !== 'skip' && !dto.review.dry_run,
        ).length,
        replies_posted: results.filter(
          (r) => r.success && r.action.decision === 'reply' && !dto.review.dry_run,
        ).length,
        skipped_duplicates: results.filter((r) => r.action.decision === 'skip').length,
        dry_run: dto.review.dry_run,
      },
      actions: reviewActions,
      warnings,
      errors,
    };

    // Store in idempotency cache
    if (scopedIdempotencyKey) {
      this.idempotencyService.store(scopedIdempotencyKey, response);
    }

    return response;
  }
}
