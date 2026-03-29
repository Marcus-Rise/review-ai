import { GitLabService } from '../../src/gitlab/gitlab.service';
import { GitLabConfig } from '../../src/common/interfaces';

const config: GitLabConfig = {
  base_url: 'https://gitlab.example.com',
  project_path: 'group/project',
  mr_iid: 42,
  token: 'glpat-test',
};

describe('GitLabService', () => {
  let service: GitLabService;

  beforeEach(() => {
    service = new GitLabService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should fetch merge request', async () => {
    const mockMr = { iid: 42, title: 'Test MR', diff_refs: {} };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMr),
    });

    const result = await service.getMergeRequest(config);
    expect(result.iid).toBe(42);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/merge_requests/42'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'PRIVATE-TOKEN': 'glpat-test' }),
      }),
    );
  });

  it('should throw on GitLab API error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    });

    await expect(service.getMergeRequest(config)).rejects.toThrow('GitLab API returned 404');
  });

  it('should fetch discussions with pagination', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `d${i}`, notes: [] }));
    const page2 = [{ id: 'd100', notes: [] }];

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(callCount === 1 ? page1 : page2),
      });
    });

    const result = await service.getDiscussions(config);
    expect(result).toHaveLength(101);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should create inline discussion', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'new-disc' }),
    });

    const result = await service.createDiscussion(config, {
      body: 'Review comment',
      position: {
        position_type: 'text',
        base_sha: 'abc',
        start_sha: 'abc',
        head_sha: 'def',
        new_path: 'src/foo.ts',
        old_path: 'src/foo.ts',
        new_line: 10,
      },
    });

    expect(result.id).toBe('new-disc');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/discussions'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should encode project path in URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ iid: 42 }),
    });

    await service.getMergeRequest(config);
    const url = (global.fetch as jest.Mock).mock.calls[0][0];
    expect(url).toContain('group%2Fproject');
  });
});
