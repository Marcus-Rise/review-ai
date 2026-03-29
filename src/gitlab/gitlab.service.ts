import { Injectable, Logger } from '@nestjs/common';
import {
  GitLabMergeRequest,
  GitLabDiffVersion,
  GitLabChange,
  GitLabDiscussion,
  CreateDiscussionPayload,
} from './gitlab.types';
import { GitLabConfig } from '../common/interfaces';

@Injectable()
export class GitLabService {
  private readonly logger = new Logger(GitLabService.name);

  private buildUrl(config: GitLabConfig, path: string): string {
    const projectEncoded = encodeURIComponent(config.project_path || String(config.project_id));
    return `${config.base_url}/api/v4/projects/${projectEncoded}${path}`;
  }

  private headers(config: GitLabConfig): Record<string, string> {
    return {
      'PRIVATE-TOKEN': config.token,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(url: string, config: GitLabConfig, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: { ...this.headers(config), ...init?.headers },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`GitLab API error: ${response.status} ${url} — ${body}`);
      throw new Error(`GitLab API returned ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async getMergeRequest(config: GitLabConfig): Promise<GitLabMergeRequest> {
    const url = this.buildUrl(config, `/merge_requests/${config.mr_iid}`);
    return this.request<GitLabMergeRequest>(url, config);
  }

  async getMrDiffVersions(config: GitLabConfig): Promise<GitLabDiffVersion[]> {
    const url = this.buildUrl(config, `/merge_requests/${config.mr_iid}/versions`);
    return this.request<GitLabDiffVersion[]>(url, config);
  }

  async getMrChanges(config: GitLabConfig): Promise<GitLabChange[]> {
    const url = this.buildUrl(
      config,
      `/merge_requests/${config.mr_iid}/changes?access_raw_diffs=true`,
    );
    const result = await this.request<{ changes: GitLabChange[] }>(url, config);
    return result.changes;
  }

  async getDiscussions(config: GitLabConfig): Promise<GitLabDiscussion[]> {
    const discussions: GitLabDiscussion[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = this.buildUrl(
        config,
        `/merge_requests/${config.mr_iid}/discussions?per_page=${perPage}&page=${page}`,
      );
      const batch = await this.request<GitLabDiscussion[]>(url, config);
      discussions.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    return discussions;
  }

  async createDiscussion(
    config: GitLabConfig,
    payload: CreateDiscussionPayload,
  ): Promise<GitLabDiscussion> {
    const url = this.buildUrl(config, `/merge_requests/${config.mr_iid}/discussions`);
    return this.request<GitLabDiscussion>(url, config, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async replyToDiscussion(config: GitLabConfig, discussionId: string, body: string): Promise<void> {
    const url = this.buildUrl(
      config,
      `/merge_requests/${config.mr_iid}/discussions/${discussionId}/notes`,
    );
    await this.request(url, config, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }
}
