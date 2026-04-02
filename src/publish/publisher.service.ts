import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GitLabService } from '../gitlab/gitlab.service';
import { GitLabConfig, ReviewAction } from '../common/interfaces';
import { PublishAction, PublishResult } from './publish.types';
import { CreateDiscussionPayload, GitLabDiffPositionPayload } from '../gitlab/gitlab.types';

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);
  private readonly concurrency: number;

  constructor(
    private readonly gitlab: GitLabService,
    private readonly configService: ConfigService,
  ) {
    this.concurrency = this.configService.get<number>('GITLAB_PUBLISH_CONCURRENCY', 5);
  }

  async publish(
    actions: PublishAction[],
    gitlabConfig: GitLabConfig,
    diffRefs: { base_sha: string; head_sha: string; start_sha: string },
    dryRun: boolean,
    fileChanges?: Array<{ path: string; old_path: string; renamed_file: boolean }>,
  ): Promise<{ results: PublishResult[]; reviewActions: ReviewAction[] }> {
    const results: PublishResult[] = [];
    const reviewActions: ReviewAction[] = [];

    // Separate actions that need GitLab API calls from those that don't
    const gitlabActions: Array<{ index: number; action: PublishAction }> = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      if (action.decision === 'skip') {
        reviewActions.push({
          type: 'skip',
          path: action.finding.file_path,
          line: action.finding.line,
          reason: action.reason,
        });
        results.push({ action, success: true });
        continue;
      }

      if (dryRun) {
        const dryRunBody =
          action.decision === 'reply'
            ? this.formatReplyBody(action.finding)
            : action.decision === 'new_discussion_with_suggestion'
              ? this.formatSuggestionBody(action.finding)
              : this.formatDiscussionBody(action.finding);
        reviewActions.push({
          type: action.decision === 'reply' ? 'reply' : action.decision,
          path: action.finding.file_path,
          line: action.finding.line,
          discussion_id: action.existing_discussion_id,
          reason: `[DRY RUN] ${action.reason}`,
          body: dryRunBody,
        });
        results.push({ action, success: true });
        continue;
      }

      gitlabActions.push({ index: i, action });
    }

    // Publish to GitLab in parallel with concurrency limit
    if (gitlabActions.length > 0) {
      const publishStart = Date.now();

      const settled = await this.executeInParallel(
        gitlabActions.map(
          ({ action }) =>
            () =>
              this.executeActionTimed(action, gitlabConfig, diffRefs, fileChanges),
        ),
        this.concurrency,
      );

      for (let j = 0; j < gitlabActions.length; j++) {
        const { action } = gitlabActions[j];
        const outcome = settled[j];

        if (outcome.status === 'fulfilled') {
          results.push(outcome.value);
          const body =
            action.decision === 'reply'
              ? this.formatReplyBody(action.finding)
              : action.decision === 'new_discussion_with_suggestion'
                ? this.formatSuggestionBody(action.finding)
                : this.formatDiscussionBody(action.finding);
          const effectiveType =
            action.decision === 'reply' && !action.existing_discussion_id
              ? 'new_discussion'
              : action.decision === 'reply'
                ? 'reply'
                : action.decision;
          reviewActions.push({
            type: effectiveType,
            path: action.finding.file_path,
            line: action.finding.line,
            discussion_id: outcome.value.discussion_id || action.existing_discussion_id,
            reason: action.reason,
            body,
          });
        } else {
          const error = outcome.reason;
          this.logger.error(
            `Failed to publish action for ${action.finding.file_path}:${action.finding.line}: ${error}`,
          );
          results.push({
            action,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.logger.log(
        `Publishing complete: ${settled.filter((s) => s.status === 'fulfilled').length}/${gitlabActions.length} succeeded in ${Date.now() - publishStart}ms (concurrency=${this.concurrency})`,
      );
    }

    return { results, reviewActions };
  }

  private async executeActionTimed(
    action: PublishAction,
    config: GitLabConfig,
    diffRefs: { base_sha: string; head_sha: string; start_sha: string },
    fileChanges?: Array<{ path: string; old_path: string; renamed_file: boolean }>,
  ): Promise<PublishResult> {
    const start = Date.now();
    try {
      const result = await this.executeAction(action, config, diffRefs, fileChanges);
      this.logger.debug(
        `Published ${action.decision} for ${action.finding.file_path}:${action.finding.line} in ${Date.now() - start}ms`,
      );
      return result;
    } catch (error) {
      this.logger.debug(
        `Failed ${action.decision} for ${action.finding.file_path}:${action.finding.line} in ${Date.now() - start}ms`,
      );
      throw error;
    }
  }

  private async executeInParallel<T>(
    tasks: Array<() => Promise<T>>,
    concurrency: number,
  ): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = [];
    for (let i = 0; i < tasks.length; i += concurrency) {
      const chunk = tasks.slice(i, i + concurrency);
      const chunkResults = await Promise.allSettled(chunk.map((fn) => fn()));
      results.push(...chunkResults);
    }
    return results;
  }

  private async executeAction(
    action: PublishAction,
    config: GitLabConfig,
    diffRefs: { base_sha: string; head_sha: string; start_sha: string },
    fileChanges?: Array<{ path: string; old_path: string; renamed_file: boolean }>,
  ): Promise<PublishResult> {
    const { finding, decision } = action;

    if (decision === 'reply' && action.existing_discussion_id) {
      const body = this.formatReplyBody(finding);
      await this.gitlab.replyToDiscussion(config, action.existing_discussion_id, body);
      return {
        action,
        success: true,
        discussion_id: action.existing_discussion_id,
      };
    }

    if (decision === 'reply' && !action.existing_discussion_id) {
      this.logger.warn(
        `reply without existing_discussion_id for ${finding.file_path}:${finding.line} — creating new discussion instead`,
      );
    }

    // New discussion or new discussion with suggestion
    const body =
      decision === 'new_discussion_with_suggestion'
        ? this.formatSuggestionBody(finding)
        : this.formatDiscussionBody(finding);

    // If not suitable for inline comment, post as general MR note
    if (!finding.is_inline_comment) {
      const locationRef =
        finding.end_line && finding.end_line !== finding.line
          ? `${finding.file_path} (Lines ${finding.line}\u2013${finding.end_line})`
          : `${finding.file_path}:${finding.line}`;
      const generalBody = `> **${locationRef}**\n\n${body}`;
      const discussion = await this.gitlab.createDiscussion(config, { body: generalBody });
      return { action, success: true, discussion_id: discussion.id };
    }

    // Build inline position
    const fileChange = fileChanges?.find((c) => c.path === finding.file_path);
    const oldPath = fileChange?.old_path || finding.file_path;

    const position: GitLabDiffPositionPayload = {
      position_type: 'text',
      base_sha: diffRefs.base_sha,
      start_sha: diffRefs.start_sha,
      head_sha: diffRefs.head_sha,
      new_path: finding.file_path,
      old_path: oldPath,
      new_line: finding.line,
    };

    const payload: CreateDiscussionPayload = { body, position };

    try {
      const discussion = await this.gitlab.createDiscussion(config, payload);
      return { action, success: true, discussion_id: discussion.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('400')) throw err;

      // Line is outside the diff hunks — fall back to a general MR note
      this.logger.warn(
        `Inline note rejected for ${finding.file_path}:${finding.line} (line not in diff), posting as general note`,
      );
      const fallbackBody = `> **${finding.file_path}:${finding.line}**\n\n${this.formatDiscussionBody(finding)}`;
      const discussion = await this.gitlab.createDiscussion(config, { body: fallbackBody });
      return { action, success: true, discussion_id: discussion.id };
    }
  }

  private formatDiscussionBody(finding: import('../common/interfaces').ModelFinding): string {
    const severity = finding.severity.toUpperCase();
    const category = finding.category;
    const rangeNote =
      finding.end_line && finding.end_line !== finding.line
        ? `*Lines ${finding.line}\u2013${finding.end_line}*\n\n`
        : '';
    return (
      `${rangeNote}` +
      `**[${severity}]** ${finding.risk_statement}\n\n` +
      `**Category:** ${category} | **Confidence:** ${finding.confidence}\n\n` +
      `${finding.rationale}`
    );
  }

  private formatSuggestionBody(finding: import('../common/interfaces').ModelFinding): string {
    const header = this.formatDiscussionBody(finding);
    if (!finding.suggestion) return header;

    return `${header}\n\n` + `\`\`\`suggestion\n${finding.suggestion}\n\`\`\``;
  }

  private formatReplyBody(finding: import('../common/interfaces').ModelFinding): string {
    return (
      `This issue appears to persist in the latest changes.\n\n` +
      `**[${finding.severity.toUpperCase()}]** ${finding.risk_statement}\n\n` +
      `${finding.rationale}`
    );
  }
}
