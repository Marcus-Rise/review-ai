import { Injectable, Logger } from '@nestjs/common';
import { GitLabService } from '../gitlab/gitlab.service';
import { GitLabConfig } from '../common/interfaces';
import {
  ReviewPacket,
  ExistingDiscussionSummary,
  ReviewFileChange,
} from './review-packet.interface';
import { buildDiscussionFingerprint } from './fingerprint.util';

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(private readonly gitlab: GitLabService) {}

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

    const latestVersion = versions[0];
    const diffRefs = {
      base_sha: gitlabConfig.base_sha || latestVersion?.base_commit_sha || mr.diff_refs.base_sha,
      head_sha: gitlabConfig.head_sha || latestVersion?.head_commit_sha || mr.diff_refs.head_sha,
      start_sha: latestVersion?.start_commit_sha || mr.diff_refs.start_sha,
    };

    const fileChanges: ReviewFileChange[] = changes.map((c) => ({
      path: c.new_path,
      old_path: c.old_path,
      diff: c.diff,
      new_file: c.new_file,
      deleted_file: c.deleted_file,
      renamed_file: c.renamed_file,
    }));

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
    };
  }
}
