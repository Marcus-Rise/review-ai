import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelFinding } from '../common/interfaces';
import { ChatCompletionRequest, ChatCompletionResponse, ModelFindingsOutput } from './model.types';
import { getSystemPrompt, buildUserPrompt } from './prompts/system-prompt';
import { ReviewPacket } from '../review/review-packet.interface';

@Injectable()
export class ModelService {
  private readonly logger = new Logger(ModelService.name);

  constructor(private readonly configService: ConfigService) {}

  async analyze(packet: ReviewPacket): Promise<ModelFinding[]> {
    const endpoint = this.configService.get<string>('MODEL_ENDPOINT');
    const model = this.configService.get<string>('MODEL_NAME');

    if (!endpoint || !model) {
      throw new Error('MODEL_ENDPOINT and MODEL_NAME must be configured');
    }

    const url = `${endpoint}/v1/chat/completions`;
    const userPrompt = buildUserPrompt(packet);

    const systemPrompt = getSystemPrompt(packet.review_profile);

    const requestBody: ChatCompletionRequest = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    };

    this.logger.log(`Calling model ${model} at ${endpoint}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(
        parseInt(this.configService.get<string>('MODEL_TIMEOUT_MS', '120000'), 10),
      ),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Model API error: ${response.status} — ${body}`);
      throw new Error(`Model API returned ${response.status}`);
    }

    const completion: ChatCompletionResponse = await response.json();
    const content = completion.choices?.[0]?.message?.content;

    if (!content) {
      this.logger.warn('Model returned empty response');
      return [];
    }

    return this.parseFindings(content);
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
