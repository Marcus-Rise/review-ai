import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelFinding } from '../common/interfaces';
import { ModelFindingsOutput } from './model.types';
import { getSystemPrompt, buildUserPrompt } from './prompts/system-prompt';
import { ReviewPacket } from '../review/review-packet.interface';
import { ModelProvider, MODEL_PROVIDER } from './providers/model-provider.interface';

@Injectable()
export class ModelService {
  private readonly logger = new Logger(ModelService.name);

  constructor(
    @Inject(MODEL_PROVIDER) private readonly provider: ModelProvider,
    private readonly configService: ConfigService,
  ) {}

  async analyze(packet: ReviewPacket): Promise<ModelFinding[]> {
    const model = this.configService.getOrThrow<string>('MODEL_NAME');

    const response = await this.provider.complete({
      model,
      systemPrompt: getSystemPrompt(packet.review_profile),
      userPrompt: buildUserPrompt(packet),
      temperature: 0.1,
      jsonMode: true,
    });

    if (!response.content) {
      this.logger.warn('Model returned empty response');
      return [];
    }

    if (response.usage) {
      this.logger.log(
        `Tokens: prompt=${response.usage.promptTokens} completion=${response.usage.completionTokens}`,
      );
    }

    return this.parseFindings(response.content);
  }

  private parseFindings(content: string): ModelFinding[] {
    let parsed: ModelFindingsOutput;
    try {
      parsed = JSON.parse(content);
    } catch {
      this.logger.error('Model returned invalid JSON');
      return [];
    }

    if (!parsed.findings || !Array.isArray(parsed.findings)) {
      this.logger.warn('Model response missing findings array');
      return [];
    }

    return parsed.findings.filter((f) => this.validateFinding(f));
  }

  private validateFinding(f: ModelFinding): boolean {
    const validCategories = [
      'correctness',
      'security',
      'testing',
      'contract',
      'architecture',
      'maintainability',
    ];
    const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
    const validConfidences = ['high', 'medium', 'low'];

    if (!f.file_path || typeof f.line !== 'number' || !Number.isInteger(f.line) || f.line < 1) {
      this.logger.debug(`Skipping finding: missing file_path or invalid line`);
      return false;
    }
    if (!validCategories.includes(f.category)) {
      this.logger.debug(`Skipping finding: invalid category ${f.category}`);
      return false;
    }
    if (!validSeverities.includes(f.severity)) {
      this.logger.debug(`Skipping finding: invalid severity ${f.severity}`);
      return false;
    }
    if (!validConfidences.includes(f.confidence)) {
      this.logger.debug(`Skipping finding: invalid confidence ${f.confidence}`);
      return false;
    }
    return true;
  }
}
