import { Logger } from '@nestjs/common';
import { PublisherService } from '../../src/publish/publisher.service';
import { GitLabService } from '../../src/gitlab/gitlab.service';
import { PublishAction } from '../../src/publish/publish.types';
import { ModelFinding, GitLabConfig } from '../../src/common/interfaces';

const mockGitlab: GitLabConfig = {
  base_url: 'https://gitlab.example.com',
  project_path: 'group/project',
  mr_iid: 1,
  token: 'token',
};

const diffRefs = { base_sha: 'abc', head_sha: 'def', start_sha: 'abc' };

const baseFinding: ModelFinding = {
  category: 'correctness',
  severity: 'high',
  confidence: 'high',
  file_path: 'src/foo.ts',
  line: 10,
  risk_statement: 'Bug',
  rationale: 'Reason',
  is_inline_comment: true,
  is_suggestion_safe: false,
};

describe('PublisherService', () => {
  let publisher: PublisherService;
  let gitlabService: GitLabService;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    gitlabService = {
      createDiscussion: jest.fn().mockResolvedValue({ id: 'new-disc-1' }),
      replyToDiscussion: jest.fn().mockResolvedValue(undefined),
    } as unknown as GitLabService;
    publisher = new PublisherService(gitlabService);
    errorSpy = jest.spyOn(Logger.prototype, 'error');
    warnSpy = jest.spyOn(Logger.prototype, 'warn');
  });

  it('should skip without calling GitLab', async () => {
    const actions: PublishAction[] = [
      { decision: 'skip', finding: baseFinding, reason: 'Duplicate' },
    ];
    const { results, reviewActions } = await publisher.publish(
      actions,
      mockGitlab,
      diffRefs,
      false,
    );
    expect(results[0].success).toBe(true);
    expect(reviewActions[0].type).toBe('skip');
    expect(gitlabService.createDiscussion).not.toHaveBeenCalled();
  });

  it('should not call GitLab in dry-run mode and include body in response', async () => {
    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: baseFinding, reason: 'New issue' },
    ];
    const { reviewActions } = await publisher.publish(actions, mockGitlab, diffRefs, true);
    expect(reviewActions[0].reason).toContain('[DRY RUN]');
    expect(reviewActions[0].body).toContain(baseFinding.risk_statement);
    expect(gitlabService.createDiscussion).not.toHaveBeenCalled();
  });

  it('should create discussion for new findings', async () => {
    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: baseFinding, reason: 'New' },
    ];
    const { results } = await publisher.publish(actions, mockGitlab, diffRefs, false);
    expect(results[0].success).toBe(true);
    expect(results[0].discussion_id).toBe('new-disc-1');
    expect(gitlabService.createDiscussion).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should populate body in reviewActions for real (non-dry-run) new_discussion', async () => {
    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: baseFinding, reason: 'New' },
    ];
    const { reviewActions } = await publisher.publish(actions, mockGitlab, diffRefs, false);
    expect(reviewActions[0].body).toBeDefined();
    expect(reviewActions[0].body).toContain(baseFinding.risk_statement);
  });

  it('should populate body in reviewActions for real (non-dry-run) reply', async () => {
    const actions: PublishAction[] = [
      {
        decision: 'reply',
        finding: baseFinding,
        existing_discussion_id: 'disc-1',
        reason: 'Reply',
      },
    ];
    const { reviewActions } = await publisher.publish(actions, mockGitlab, diffRefs, false);
    expect(reviewActions[0].body).toBeDefined();
    expect(reviewActions[0].body).toContain(baseFinding.risk_statement);
  });

  it('should not populate body for skip actions', async () => {
    const actions: PublishAction[] = [
      { decision: 'skip', finding: baseFinding, reason: 'Duplicate' },
    ];
    const { reviewActions } = await publisher.publish(actions, mockGitlab, diffRefs, false);
    expect(reviewActions[0].body).toBeUndefined();
  });

  it('should reply to existing discussion', async () => {
    const actions: PublishAction[] = [
      {
        decision: 'reply',
        finding: baseFinding,
        existing_discussion_id: 'disc-1',
        reason: 'Reply',
      },
    ];
    const { results } = await publisher.publish(actions, mockGitlab, diffRefs, false);
    expect(results[0].success).toBe(true);
    expect(gitlabService.replyToDiscussion).toHaveBeenCalledWith(
      mockGitlab,
      'disc-1',
      expect.any(String),
    );
  });

  it('should warn and create new discussion when reply has no existing_discussion_id', async () => {
    const actions: PublishAction[] = [{ decision: 'reply', finding: baseFinding, reason: 'Reply' }];
    const { results, reviewActions } = await publisher.publish(
      actions,
      mockGitlab,
      diffRefs,
      false,
    );
    expect(results[0].success).toBe(true);
    expect(gitlabService.replyToDiscussion).not.toHaveBeenCalled();
    expect(gitlabService.createDiscussion).toHaveBeenCalledTimes(1);
    expect(reviewActions[0].type).toBe('new_discussion');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('reply without existing_discussion_id'),
    );
  });

  it('should rethrow non-400 errors without fallback', async () => {
    (gitlabService.createDiscussion as jest.Mock).mockRejectedValueOnce(
      new Error('GitLab API returned 500: Internal Server Error'),
    );
    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: baseFinding, reason: 'New' },
    ];
    const { results } = await publisher.publish(actions, mockGitlab, diffRefs, false);
    expect(results[0].success).toBe(false);
    expect(gitlabService.createDiscussion).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to publish action'));
  });

  it('should fall back to general note when inline position is rejected with 400', async () => {
    (gitlabService.createDiscussion as jest.Mock)
      .mockRejectedValueOnce(new Error("GitLab API returned 400: line_code can't be blank"))
      .mockResolvedValueOnce({ id: 'fallback-disc-1' });

    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: baseFinding, reason: 'New' },
    ];
    const { results } = await publisher.publish(actions, mockGitlab, diffRefs, false);
    expect(results[0].success).toBe(true);
    expect(results[0].discussion_id).toBe('fallback-disc-1');
    expect(gitlabService.createDiscussion).toHaveBeenCalledTimes(2);
    const fallbackCall = (gitlabService.createDiscussion as jest.Mock).mock.calls[1];
    expect(fallbackCall[1].position).toBeUndefined();
    expect(fallbackCall[1].body).toContain('src/foo.ts:10');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Inline note rejected'));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should post as general MR note when is_inline_comment is false', async () => {
    const generalFinding: ModelFinding = {
      ...baseFinding,
      is_inline_comment: false,
    };
    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: generalFinding, reason: 'Architecture issue' },
    ];
    const { results } = await publisher.publish(actions, mockGitlab, diffRefs, false);
    expect(results[0].success).toBe(true);
    const call = (gitlabService.createDiscussion as jest.Mock).mock.calls[0];
    expect(call[1].position).toBeUndefined();
    expect(call[1].body).toContain(generalFinding.file_path);
  });

  it('should use old_path from file changes for renamed files', async () => {
    const renamedFinding: ModelFinding = {
      ...baseFinding,
      file_path: 'src/new-name.ts',
    };
    const fileChanges = [
      {
        path: 'src/new-name.ts',
        old_path: 'src/old-name.ts',
        diff: '+code',
        new_file: false,
        deleted_file: false,
        renamed_file: true,
      },
    ];
    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: renamedFinding, reason: 'Issue' },
    ];
    const { results } = await publisher.publish(actions, mockGitlab, diffRefs, false, fileChanges);
    expect(results[0].success).toBe(true);
    const call = (gitlabService.createDiscussion as jest.Mock).mock.calls[0];
    expect(call[1].position.old_path).toBe('src/old-name.ts');
    expect(call[1].position.new_path).toBe('src/new-name.ts');
  });

  it('should include line range in body when end_line differs from line', async () => {
    const multiLineFinding: ModelFinding = {
      ...baseFinding,
      end_line: 15,
    };
    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: multiLineFinding, reason: 'Issue' },
    ];
    await publisher.publish(actions, mockGitlab, diffRefs, false);
    const call = (gitlabService.createDiscussion as jest.Mock).mock.calls[0];
    expect(call[1].body).toContain('Lines 10–15');
  });

  it('should create discussion with suggestion', async () => {
    const findingWithSugg: ModelFinding = {
      ...baseFinding,
      suggestion: 'const x = 1;',
      is_suggestion_safe: true,
    };
    const actions: PublishAction[] = [
      { decision: 'new_discussion_with_suggestion', finding: findingWithSugg, reason: 'Fix' },
    ];
    await publisher.publish(actions, mockGitlab, diffRefs, false);
    const call = (gitlabService.createDiscussion as jest.Mock).mock.calls[0];
    expect(call[1].body).toContain('```suggestion');
    expect(call[1].body).toContain('const x = 1;');
  });
});
