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

  it('should filter out binary/generated files', async () => {
    const gitlabService = makeGitlabService('opened');
    (gitlabService.getMrChanges as jest.Mock).mockResolvedValue([
      {
        new_path: 'src/app.ts',
        old_path: 'src/app.ts',
        diff: '+code',
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      },
      {
        new_path: 'bundle.min.js',
        old_path: 'bundle.min.js',
        diff: '+minified',
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      },
      {
        new_path: 'pnpm-lock.yaml',
        old_path: 'pnpm-lock.yaml',
        diff: '+lock',
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      },
      {
        new_path: 'app.js.map',
        old_path: 'app.js.map',
        diff: '+map',
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      },
      {
        new_path: 'logo.png',
        old_path: 'logo.png',
        diff: 'Binary file',
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      },
    ]);
    const service = new ContextBuilderService(gitlabService);
    const packet = await service.build(mockGitlab, 'default');
    expect(packet.changes).toHaveLength(1);
    expect(packet.changes[0].path).toBe('src/app.ts');
    expect(packet.warnings).toEqual(expect.arrayContaining([expect.stringContaining('filtered')]));
  });

  it('should truncate individual file diffs exceeding per-file limit', async () => {
    const gitlabService = makeGitlabService('opened');
    const largeDiff = 'a'.repeat(15000);
    (gitlabService.getMrChanges as jest.Mock).mockResolvedValue([
      {
        new_path: 'big.ts',
        old_path: 'big.ts',
        diff: largeDiff,
        new_file: false,
        deleted_file: false,
        renamed_file: false,
      },
    ]);
    const service = new ContextBuilderService(gitlabService);
    const packet = await service.build(mockGitlab, 'default');
    expect(packet.changes[0].diff.length).toBeLessThanOrEqual(10100);
    expect(packet.warnings).toEqual(expect.arrayContaining([expect.stringContaining('truncated')]));
  });

  it('should limit total files to MAX_FILES', async () => {
    const gitlabService = makeGitlabService('opened');
    const manyChanges = Array.from({ length: 60 }, (_, i) => ({
      new_path: `file${i}.ts`,
      old_path: `file${i}.ts`,
      diff: '+line',
      new_file: false,
      deleted_file: false,
      renamed_file: false,
    }));
    (gitlabService.getMrChanges as jest.Mock).mockResolvedValue(manyChanges);
    const service = new ContextBuilderService(gitlabService);
    const packet = await service.build(mockGitlab, 'default');
    expect(packet.changes.length).toBeLessThanOrEqual(50);
    expect(packet.warnings).toEqual(expect.arrayContaining([expect.stringContaining('50')]));
  });

  it('should enforce total diff char limit across all files', async () => {
    const gitlabService = makeGitlabService('opened');
    const changes = Array.from({ length: 20 }, (_, i) => ({
      new_path: `file${i}.ts`,
      old_path: `file${i}.ts`,
      diff: 'x'.repeat(8000),
      new_file: false,
      deleted_file: false,
      renamed_file: false,
    }));
    (gitlabService.getMrChanges as jest.Mock).mockResolvedValue(changes);
    const service = new ContextBuilderService(gitlabService);
    const packet = await service.build(mockGitlab, 'default');
    const totalChars = packet.changes.reduce((sum, c) => sum + c.diff.length, 0);
    expect(totalChars).toBeLessThanOrEqual(101000);
    expect(packet.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('limit reached')]),
    );
  });
});
