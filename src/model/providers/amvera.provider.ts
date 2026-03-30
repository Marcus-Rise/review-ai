import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ModelProvider,
  ModelProviderRequest,
  ModelProviderResponse,
} from './model-provider.interface';

interface AmveraModelConfig {
  endpoint: string;
  reasoning?: boolean;
}

/** Конфиг моделей Amvera: эндпоинт + поведение. Добавить модель = одна строка. */
const MODELS: Record<string, AmveraModelConfig> = {
  'gpt-4.1': { endpoint: '/models/gpt' },
  'gpt-5': { endpoint: '/models/gpt', reasoning: true },
  'deepseek-R1': { endpoint: '/models/deepseek' },
  'deepseek-V3': { endpoint: '/models/deepseek' },
  qwen3_30b: { endpoint: '/models/qwen' },
  qwen3_235b: { endpoint: '/models/qwen' },
};

const DEFAULT_ENDPOINT = 'https://kong-proxy.yc.amvera.ru/api/v1';

export class AmveraProvider implements ModelProvider {
  private readonly logger = new Logger(AmveraProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly apiKey: string,
  ) {}

  async complete(req: ModelProviderRequest): Promise<ModelProviderResponse> {
    const baseUrl = this.config.get<string>('MODEL_ENDPOINT') || DEFAULT_ENDPOINT;
    const timeoutMs = parseInt(this.config.get<string>('MODEL_TIMEOUT_MS', '120000'), 10);

    const modelConfig = MODELS[req.model];
    if (!modelConfig) {
      throw new Error(
        `Unknown Amvera model "${req.model}". Supported: ${Object.keys(MODELS).join(', ')}`,
      );
    }

    const url = `${baseUrl}${modelConfig.endpoint}`;

    const body: Record<string, unknown> = {
      model: req.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
    };

    if (modelConfig.reasoning) {
      body.reasoning_effort = 'low';
    } else {
      body.temperature = req.temperature;
    }

    if (req.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const bodyStr = JSON.stringify(body);
    const byteSize = Buffer.byteLength(bodyStr, 'utf-8');
    this.logger.log(`POST ${url} model=${req.model} body=${bodyStr.length}ch/${byteSize}b`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': `Bearer ${this.apiKey}`,
      },
      body: bodyStr,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Amvera API error: ${res.status} — ${text}`);
      throw new Error(`Model API returned ${res.status}`);
    }

    const json = await res.json();

    const message = json.choices?.[0]?.message;
    const content = message?.content ?? message?.text ?? '';

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
