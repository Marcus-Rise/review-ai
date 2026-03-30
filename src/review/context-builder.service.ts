import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { GitLabService } from '../gitlab/gitlab.service';
import { GitLabConfig } from '../common/interfaces';
import {
  ReviewPacket,
  ExistingDiscussionSummary,
  ReviewFileChange,
} from './review-packet.interface';
import { buildDiscussionFingerprint } from './fingerprint.util';
import { CONTEXT_LIMITS, ContextLimits } from './context-limits';

const FILTERED_EXTENSIONS =
  /\.(min\.js|min\.css|lock|map|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|pdf|zip|tar|gz|bin|exe|dll|so|dylib)$/i;
const FILTERED_FILENAMES =
  /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.lock|Gemfile\.lock|Cargo\.lock)$/;
const FILTERED_PATHS = /(?:^|\/)(vendor|node_modules|dist|\.yarn)\//;

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(
    private readonly gitlab: GitLabService,
    @Inject(CONTEXT_LIMITS) private readonly limits: ContextLimits,
  ) {
    const bytesInfo = this.limits.maxTotalDiffBytes
      ? `, ${this.limits.maxTotalDiffBytes}b total bytes`
      : '';
    this.logger.log(
      `Context limits: ${this.limits.maxFiles} files, ${this.limits.maxDiffCharsPerFile}/file, ${this.limits.maxTotalDiffChars} total${bytesInfo}`,
    );
  }

  async build(
    gitlabConfig: GitLabConfig,
    profile: string,
    userFocus?: string,
  ): Promise<ReviewPacket> {
    this.logger.log(`Building review context for MR !${gitlabConfig.mr_iid}`);

    const [mr, changes, discussions, versions] = await Promise.all([
      this.gitlab.getMergeRequest(gitlabConfig),
      this.gitlab.getMrChanges(gitlabConfig),
      this.gitlab.getDiscussions(gitlabConfig),
      this.gitlab.getMrDiffVersions(gitlabConfig),
    ]);

    if (mr.state === 'closed' || mr.state === 'merged') {
      throw new BadRequestException(
        `MR !${gitlabConfig.mr_iid} is ${mr.state} — review only allowed on opened MRs`,
      );
    }

    const latestVersion = versions[0];
    const diffRefs = {
      base_sha: gitlabConfig.base_sha || latestVersion?.base_commit_sha || mr.diff_refs.base_sha,
      head_sha: gitlabConfig.head_sha || latestVersion?.head_commit_sha || mr.diff_refs.head_sha,
      start_sha: latestVersion?.start_commit_sha || mr.diff_refs.start_sha,
    };

    const rawChanges: ReviewFileChange[] = changes.map((c) => ({
      path: c.new_path,
      old_path: c.old_path,
      diff: c.diff,
      new_file: c.new_file,
      deleted_file: c.deleted_file,
      renamed_file: c.renamed_file,
    }));

    const { changes: fileChanges, warnings } = this.boundChanges(rawChanges);

    const existingDiscussions: ExistingDiscussionSummary[] = discussions
      .filter((d) => d.notes.length > 0 && !d.notes[0].system)
      .map((d) => {
        const note = d.notes[0];
        return {
          discussion_id: d.id,
          file_path: note.position?.new_path || note.position?.old_path,
          line: note.position?.new_line || note.position?.old_line,
          body: note.body,
          resolved: note.resolved,
          author: note.author.username,
          fingerprint: buildDiscussionFingerprint(d),
        };
      });

    this.logger.log(
      `Context built: ${fileChanges.length} files, ${existingDiscussions.length} existing discussions`,
    );

    return {
      mr_title: mr.title,
      mr_description: mr.description || '',
      source_branch: mr.source_branch,
      target_branch: mr.target_branch,
      changes: fileChanges,
      existing_discussions: existingDiscussions,
      diff_refs: diffRefs,
      review_profile: profile,
      user_focus: userFocus,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  private boundChanges(rawChanges: ReviewFileChange[]): {
    changes: ReviewFileChange[];
    warnings: string[];
  } {
    const warnings: string[] = [];

    // 1. Filter generated/binary files
    const filtered = rawChanges.filter((c) => {
      if (
        FILTERED_EXTENSIONS.test(c.path) ||
        FILTERED_FILENAMES.test(c.path) ||
        FILTERED_PATHS.test(c.path)
      )
        return false;
      if (c.diff.startsWith('Binary') || c.diff === '') return false;
      return true;
    });
    const filteredCount = rawChanges.length - filtered.length;
    if (filteredCount > 0) {
      warnings.push(`${filteredCount} generated/binary file(s) filtered out`);
    }

    // 2. Limit file count
    let bounded = filtered;
    if (bounded.length > this.limits.maxFiles) {
      warnings.push(`Truncated from ${bounded.length} to ${this.limits.maxFiles} files`);
      bounded = bounded.slice(0, this.limits.maxFiles);
    }

    // 3. Truncate per-file diffs and enforce total limit
    let totalChars = 0;
    let totalBytes = 0;
    const result: ReviewFileChange[] = [];
    for (const change of bounded) {
      let diff = change.diff;
      if (diff.length > this.limits.maxDiffCharsPerFile) {
        diff = diff.slice(0, this.limits.maxDiffCharsPerFile) + '\n... [truncated]';
        warnings.push(`${change.path}: diff truncated to ${this.limits.maxDiffCharsPerFile} chars`);
      }
      if (totalChars + diff.length > this.limits.maxTotalDiffChars) {
        warnings.push(`Total diff size limit reached at ${change.path}, remaining files excluded`);
        break;
      }
      if (this.limits.maxTotalDiffBytes) {
        const diffBytes = Buffer.byteLength(diff, 'utf-8');
        if (totalBytes + diffBytes > this.limits.maxTotalDiffBytes) {
          warnings.push(
            `Total diff byte limit reached at ${change.path}, remaining files excluded`,
          );
          break;
        }
        totalBytes += diffBytes;
      }
      totalChars += diff.length;
      result.push({ ...change, diff });
    }

    return { changes: result, warnings };
  }
}
