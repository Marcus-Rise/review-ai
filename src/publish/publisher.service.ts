import { Injectable, Logger } from '@nestjs/common';
import { GitLabService } from '../gitlab/gitlab.service';
import { GitLabConfig, ReviewAction } from '../common/interfaces';
import { PublishAction, PublishResult } from './publish.types';
import { CreateDiscussionPayload, GitLabDiffPositionPayload } from '../gitlab/gitlab.types';

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(private readonly gitlab: GitLabService) {}

  async publish(
    actions: PublishAction[],
    gitlabConfig: GitLabConfig,
    diffRefs: { base_sha: string; head_sha: string; start_sha: string },
    dryRun: boolean,
  ): Promise<{ results: PublishResult[]; reviewActions: ReviewAction[] }> {
    const results: PublishResult[] = [];
    const reviewActions: ReviewAction[] = [];

    for (const action of actions) {
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
        reviewActions.push({
          type: action.decision === 'reply' ? 'reply' : action.decision,
          path: action.finding.file_path,
          line: action.finding.line,
          discussion_id: action.existing_discussion_id,
          reason: `[DRY RUN] ${action.reason}`,
        });
        results.push({ action, success: true });
        continue;
      }

      try {
        const result = await this.executeAction(action, gitlabConfig, diffRefs);
        results.push(result);
        reviewActions.push({
          type: action.decision === 'reply' ? 'reply' : action.decision,
          path: action.finding.file_path,
          line: action.finding.line,
          discussion_id: result.discussion_id || action.existing_discussion_id,
          reason: action.reason,
        });
      } catch (error) {
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

    return { results, reviewActions };
  }

  private async executeAction(
    action: PublishAction,
    config: GitLabConfig,
    diffRefs: { base_sha: string; head_sha: string; start_sha: string },
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

    // New discussion or new discussion with suggestion
    const body =
      decision === 'new_discussion_with_suggestion'
        ? this.formatSuggestionBody(finding)
        : this.formatDiscussionBody(finding);

    const position: GitLabDiffPositionPayload = {
      position_type: 'text',
      base_sha: diffRefs.base_sha,
      start_sha: diffRefs.start_sha,
      head_sha: diffRefs.head_sha,
      new_path: finding.file_path,
      old_path: finding.file_path,
      new_line: finding.line,
    };

    const payload: CreateDiscussionPayload = { body, position };
    const discussion = await this.gitlab.createDiscussion(config, payload);

    return {
      action,
      success: true,
      discussion_id: discussion.id,
    };
  }

  private formatDiscussionBody(finding: import('../common/interfaces').ModelFinding): string {
    const severity = finding.severity.toUpperCase();
    const category = finding.category;
    return (
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
