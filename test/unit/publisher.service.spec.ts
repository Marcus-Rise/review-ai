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

  beforeEach(() => {
    gitlabService = {
      createDiscussion: jest.fn().mockResolvedValue({ id: 'new-disc-1' }),
      replyToDiscussion: jest.fn().mockResolvedValue(undefined),
    } as unknown as GitLabService;
    publisher = new PublisherService(gitlabService);
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

  it('should not call GitLab in dry-run mode', async () => {
    const actions: PublishAction[] = [
      { decision: 'new_discussion', finding: baseFinding, reason: 'New issue' },
    ];
    const { reviewActions } = await publisher.publish(actions, mockGitlab, diffRefs, true);
    expect(reviewActions[0].reason).toContain('[DRY RUN]');
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
