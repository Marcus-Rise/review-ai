import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ModelProvider,
  ModelProviderRequest,
  ModelProviderResponse,
} from './model-provider.interface';

const DEFAULT_ENDPOINT = 'https://api.openai.com';

export class OpenAiProvider implements ModelProvider {
  private readonly logger = new Logger(OpenAiProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly apiKey?: string,
  ) {}

  async complete(req: ModelProviderRequest): Promise<ModelProviderResponse> {
    const endpoint = this.config.get<string>('MODEL_ENDPOINT') || DEFAULT_ENDPOINT;
    const timeoutMs = parseInt(this.config.get<string>('MODEL_TIMEOUT_MS', '120000'), 10);

    const url = `${endpoint}/v1/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const body = {
      model: req.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      temperature: req.temperature,
      ...(req.jsonMode && { response_format: { type: 'json_object' } }),
    };

    this.logger.log(`POST ${url} model=${req.model}`);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`OpenAI API error: ${res.status} — ${text}`);
      throw new Error(`Model API returned ${res.status}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? '';

    return {
      content,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens,
            totalTokens: json.usage.total_tokens,
          }
        : undefined,
    };
  }
}
