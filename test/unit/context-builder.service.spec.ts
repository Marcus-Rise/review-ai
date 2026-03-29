import { BadRequestException } from '@nestjs/common';
import { ContextBuilderService } from '../../src/review/context-builder.service';
import { GitLabService } from '../../src/gitlab/gitlab.service';
import { GitLabConfig } from '../../src/common/interfaces';

const mockGitlab: GitLabConfig = {
  base_url: 'https://gitlab.example.com',
  project_path: 'group/project',
  mr_iid: 1,
  token: 'token',
};

const baseMr = {
  iid: 1,
  title: 'My MR',
  description: 'desc',
  source_branch: 'feature',
  target_branch: 'main',
  state: 'opened',
  diff_refs: { base_sha: 'abc', head_sha: 'def', start_sha: 'abc' },
  web_url: 'https://gitlab.example.com/group/project/-/merge_requests/1',
};

function makeGitlabService(mrState: string) {
  return {
    getMergeRequest: jest.fn().mockResolvedValue({ ...baseMr, state: mrState }),
    getMrChanges: jest.fn().mockResolvedValue([]),
    getDiscussions: jest.fn().mockResolvedValue([]),
    getMrDiffVersions: jest
      .fn()
      .mockResolvedValue([
        { head_commit_sha: 'def', base_commit_sha: 'abc', start_commit_sha: 'abc' },
      ]),
  } as unknown as GitLabService;
}

describe('ContextBuilderService', () => {
  it('should build context for an opened MR', async () => {
    const gitlabService = makeGitlabService('opened');
    const service = new ContextBuilderService(gitlabService);
    const packet = await service.build(mockGitlab, 'default');
    expect(packet.mr_title).toBe('My MR');
    expect(packet.changes).toHaveLength(0);
  });

  it('should throw BadRequestException for a closed MR', async () => {
    const gitlabService = makeGitlabService('closed');
    const service = new ContextBuilderService(gitlabService);
    await expect(service.build(mockGitlab, 'default')).rejects.toThrow(BadRequestException);
    await expect(service.build(mockGitlab, 'default')).rejects.toThrow(/closed/i);
  });

  it('should throw BadRequestException for a merged MR', async () => {
    const gitlabService = makeGitlabService('merged');
    const service = new ContextBuilderService(gitlabService);
    await expect(service.build(mockGitlab, 'default')).rejects.toThrow(BadRequestException);
    await expect(service.build(mockGitlab, 'default')).rejects.toThrow(/merged/i);
  });
});
