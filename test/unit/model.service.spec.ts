import { ModelService } from '../../src/model/model.service';
import { ConfigService } from '@nestjs/config';
import { ReviewPacket } from '../../src/review/review-packet.interface';

const mockPacket: ReviewPacket = {
  mr_title: 'Test MR',
  mr_description: 'Test description',
  source_branch: 'feature',
  target_branch: 'main',
  changes: [
    {
      path: 'src/foo.ts',
      old_path: 'src/foo.ts',
      diff: '+line',
      new_file: false,
      deleted_file: false,
      renamed_file: false,
    },
  ],
  existing_discussions: [],
  diff_refs: { base_sha: 'abc', head_sha: 'def', start_sha: 'abc' },
  review_profile: 'default',
};

describe('ModelService', () => {
  let service: ModelService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, def?: unknown) => {
        const map: Record<string, unknown> = {
          MODEL_ENDPOINT: 'http://localhost:11434',
          MODEL_NAME: 'codellama',
          MODEL_TIMEOUT_MS: 5000,
        };
        return map[key] ?? def;
      }),
    } as unknown as ConfigService;
    service = new ModelService(configService);
  });

  it('should throw when MODEL_ENDPOINT not configured', async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);
    await expect(service.analyze(mockPacket)).rejects.toThrow(
      'MODEL_ENDPOINT and MODEL_NAME must be configured',
    );
  });

  it('should parse valid model response', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              findings: [
                {
                  category: 'correctness',
                  severity: 'high',
                  confidence: 'high',
                  file_path: 'src/foo.ts',
                  line: 5,
                  risk_statement: 'Bug found',
                  rationale: 'Reason',
                  is_inline_comment: true,
                  is_suggestion_safe: false,
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const findings = await service.analyze(mockPacket);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('correctness');
  });

  it('should return empty array for invalid JSON response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'not json {' } }] }),
    });

    const findings = await service.analyze(mockPacket);
    expect(findings).toHaveLength(0);
  });

  it('should filter out findings with invalid fields', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              findings: [
                {
                  category: 'invalid',
                  severity: 'high',
                  confidence: 'high',
                  file_path: 'f',
                  line: 1,
                  risk_statement: 'x',
                  rationale: 'y',
                  is_inline_comment: true,
                  is_suggestion_safe: false,
                },
                {
                  category: 'correctness',
                  severity: 'high',
                  confidence: 'high',
                  file_path: 'f',
                  line: 2,
                  risk_statement: 'x',
                  rationale: 'y',
                  is_inline_comment: true,
                  is_suggestion_safe: false,
                },
              ],
            }),
          },
        },
      ],
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const findings = await service.analyze(mockPacket);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
  });

  it('should handle model API errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal error'),
    });

    await expect(service.analyze(mockPacket)).rejects.toThrow('Model API returned 500');
  });
});
