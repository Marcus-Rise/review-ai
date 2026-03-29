import { Injectable, Logger } from '@nestjs/common';
import { ModelFinding } from '../common/interfaces';
import { ExistingDiscussionSummary } from '../review/review-packet.interface';
import { PublishAction } from './publish.types';
import { buildFindingFingerprint } from '../review/fingerprint.util';

const MAX_SUGGESTION_LINES = 20;

@Injectable()
export class DecisionEngineService {
  private readonly logger = new Logger(DecisionEngineService.name);

  decide(
    findings: ModelFinding[],
    existingDiscussions: ExistingDiscussionSummary[],
  ): PublishAction[] {
    const actions: PublishAction[] = [];

    for (const finding of findings) {
      const action = this.decideSingle(finding, existingDiscussions);
      actions.push(action);
    }

    this.logger.log(
      `Decision results: ${actions.filter((a) => a.decision === 'skip').length} skip, ` +
        `${actions.filter((a) => a.decision === 'reply').length} reply, ` +
        `${actions.filter((a) => a.decision === 'new_discussion').length} new, ` +
        `${actions.filter((a) => a.decision === 'new_discussion_with_suggestion').length} suggestion`,
    );

    return actions;
  }

  private decideSingle(
    finding: ModelFinding,
    existing: ExistingDiscussionSummary[],
  ): PublishAction {
    // Check for matching unresolved discussion
    const match = this.findMatchingDiscussion(finding, existing);

    if (match && !match.resolved) {
      return {
        decision: 'skip',
        finding,
        existing_discussion_id: match.discussion_id,
        reason: `Unresolved discussion already exists: ${match.discussion_id}`,
      };
    }

    // If resolved discussion exists with same topic, allow new discussion
    // but prefer reply if the context matches closely
    if (match && match.resolved) {
      return {
        decision: 'new_discussion',
        finding,
        reason: 'Similar discussion was resolved but issue reappears in new changes',
      };
    }

    // Check for nearby unresolved discussions on same file/line
    const nearby = this.findNearbyDiscussion(finding, existing);
    if (nearby && !nearby.resolved) {
      return {
        decision: 'reply',
        finding,
        existing_discussion_id: nearby.discussion_id,
        reason: `Related unresolved discussion exists at nearby location`,
      };
    }

    // Check if suggestion is appropriate
    if (this.isSuggestionSafe(finding)) {
      return {
        decision: 'new_discussion_with_suggestion',
        finding,
        reason: `Safe local fix available: ${finding.category}`,
      };
    }

    return {
      decision: 'new_discussion',
      finding,
      reason: `New issue: ${finding.category} — ${finding.severity}`,
    };
  }

  private findMatchingDiscussion(
    finding: ModelFinding,
    existing: ExistingDiscussionSummary[],
  ): ExistingDiscussionSummary | undefined {
    const findingFp = buildFindingFingerprint(
      finding.file_path,
      finding.line,
      finding.category,
      finding.risk_statement,
    );

    return existing.find((d) => {
      if (d.fingerprint === findingFp) return true;
      // Fallback: same file + line + category + meaningful risk_statement overlap
      if (d.file_path !== finding.file_path || d.line !== finding.line) return false;
      if (!d.body.toLowerCase().includes(finding.category.toLowerCase())) return false;

      const findingWords = new Set(
        this.normalizeForComparison(finding.risk_statement)
          .split(/\s+/)
          .filter((w) => w.length > 3),
      );
      const bodyWords = this.normalizeForComparison(d.body).split(/\s+/);
      const overlap = bodyWords.filter((w) => findingWords.has(w)).length;
      // Relax threshold for concise findings with few significant tokens
      const threshold = findingWords.size <= 2 ? 1 : 2;
      return overlap >= threshold;
    });
  }

  private findNearbyDiscussion(
    finding: ModelFinding,
    existing: ExistingDiscussionSummary[],
  ): ExistingDiscussionSummary | undefined {
    const LINE_PROXIMITY = 3;
    return existing.find(
      (d) =>
        d.file_path === finding.file_path &&
        d.line !== undefined &&
        Math.abs(d.line - finding.line) <= LINE_PROXIMITY &&
        !d.resolved &&
        d.body.toLowerCase().includes(finding.category.toLowerCase()),
    );
  }

  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  private isSuggestionSafe(finding: ModelFinding): boolean {
    if (!finding.is_suggestion_safe || !finding.suggestion) return false;

    const lines = finding.suggestion.split('\n').length;
    if (lines > MAX_SUGGESTION_LINES) return false;

    // Don't suggest for critical/security issues — those need human judgment
    if (finding.severity === 'critical' && finding.category === 'security') return false;

    return true;
  }
}
