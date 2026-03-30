import { ModelService } from '../../src/model/model.service';
import { ConfigService } from '@nestjs/config';
import { ReviewPacket } from '../../src/review/review-packet.interface';
import { Logger } from '@nestjs/common';
import { ModelProvider } from '../../src/model/providers/model-provider.interface';

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
  let mockProvider: jest.Mocked<ModelProvider>;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, def?: unknown) => {
        const map: Record<string, unknown> = {
          MODEL_NAME: 'codellama',
        };
        return map[key] ?? def;
      }),
      getOrThrow: jest.fn((key: string) => {
        const map: Record<string, unknown> = {
          MODEL_NAME: 'codellama',
        };
        const val = map[key];
        if (val === undefined) throw new Error(`Missing ${key}`);
        return val;
      }),
    } as unknown as ConfigService;

    mockProvider = {
      complete: jest.fn().mockResolvedValue({
        content: JSON.stringify({ findings: [] }),
      }),
    };

    service = new ModelService(mockProvider, configService);
  });

  it('should call provider.complete with correct parameters', async () => {
    await service.analyze(mockPacket);

    expect(mockProvider.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'codellama',
        temperature: 0.1,
        jsonMode: true,
      }),
    );
  });

  it('should throw when MODEL_NAME not configured', async () => {
    (configService.getOrThrow as jest.Mock).mockImplementation(() => {
      throw new Error('Missing MODEL_NAME');
    });
    await expect(service.analyze(mockPacket)).rejects.toThrow('Missing MODEL_NAME');
  });

  it('should parse valid model response', async () => {
    mockProvider.complete.mockResolvedValue({
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
    });

    const findings = await service.analyze(mockPacket);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('correctness');
  });

  it('should return empty array for empty content', async () => {
    mockProvider.complete.mockResolvedValue({ content: '' });

    const findings = await service.analyze(mockPacket);
    expect(findings).toHaveLength(0);
  });

  it('should return empty array for invalid JSON response', async () => {
    mockProvider.complete.mockResolvedValue({ content: 'not json {' });

    const findings = await service.analyze(mockPacket);
    expect(findings).toHaveLength(0);
  });

  it('should filter out findings with invalid fields', async () => {
    mockProvider.complete.mockResolvedValue({
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
    });

    const findings = await service.analyze(mockPacket);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(2);
  });

  it('should reject findings with invalid line numbers (0, negative, decimal, NaN)', async () => {
    const invalidLines = [0, -1, 2.5, NaN];
    const findings = invalidLines.map((line) => ({
      category: 'correctness',
      severity: 'high',
      confidence: 'high',
      file_path: 'f',
      line,
      risk_statement: 'x',
      rationale: 'y',
      is_inline_comment: true,
      is_suggestion_safe: false,
    }));
    findings.push({
      category: 'correctness',
      severity: 'high',
      confidence: 'high',
      file_path: 'f',
      line: 10,
      risk_statement: 'x',
      rationale: 'y',
      is_inline_comment: true,
      is_suggestion_safe: false,
    });

    mockProvider.complete.mockResolvedValue({
      content: JSON.stringify({ findings }),
    });

    const result = await service.analyze(mockPacket);
    expect(result).toHaveLength(1);
    expect(result[0].line).toBe(10);
  });

  it('should handle provider errors', async () => {
    mockProvider.complete.mockRejectedValue(new Error('Model API returned 500'));

    await expect(service.analyze(mockPacket)).rejects.toThrow('Model API returned 500');
  });

  it('should log usage tokens when present', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log');

    mockProvider.complete.mockResolvedValue({
      content: JSON.stringify({ findings: [] }),
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    await service.analyze(mockPacket);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('prompt=100'));
  });
});
