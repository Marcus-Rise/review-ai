import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ModelProvider,
  ModelProviderRequest,
  ModelProviderResponse,
} from './model-provider.interface';

/** Маппинг model ID → путь эндпоинта Amvera */
const MODEL_ENDPOINT_MAP: Record<string, string> = {
  llama8b: '/models/llama',
  llama70b: '/models/llama',
  'gpt-4.1': '/models/gpt',
  'gpt-5': '/models/gpt',
  'deepseek-R1': '/models/deepseek',
  'deepseek-V3': '/models/deepseek',
  qwen3_30b: '/models/qwen',
  qwen3_235b: '/models/qwen',
};

/**
 * Модели с reasoning — не поддерживают temperature,
 * вместо него используют reasoning_effort.
 * gpt-5 требует reasoning_effort: low чтобы уложиться в 60s gateway timeout Amvera.
 */
const REASONING_MODELS = new Set<string>(['gpt-5']);

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

    const modelPath = MODEL_ENDPOINT_MAP[req.model];
    if (!modelPath) {
      throw new Error(
        `Unknown Amvera model "${req.model}". Supported: ${Object.keys(MODEL_ENDPOINT_MAP).join(', ')}`,
      );
    }

    const url = `${baseUrl}${modelPath}`;
    const isReasoning = REASONING_MODELS.has(req.model);

    // Amvera использует "text" вместо "content" в messages (Swagger spec)
    const body: Record<string, unknown> = {
      model: req.model,
      messages: [
        { role: 'system', text: req.systemPrompt },
        { role: 'user', text: req.userPrompt },
      ],
    };

    if (isReasoning) {
      body.reasoning_effort = 'low';
    } else {
      body.temperature = req.temperature;
    }

    if (req.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const bodyStr = JSON.stringify(body);
    this.logger.log(`POST ${url} model=${req.model} body=${bodyStr.length}b`);

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

    // GPT-формат: choices[].message.text (Swagger)
    // Fallback на content (на случай изменений API)
    // LLaMA-формат (deprecated): alternatives[].message.text
    const gptMessage = json.choices?.[0]?.message;
    const content =
      gptMessage?.text ??
      gptMessage?.content ??
      json.alternatives?.[0]?.message?.text ??
      json.result?.alternatives?.[0]?.message?.text ??
      '';

    // Usage: GPT = числа, LLaMA = строки
    const usage = json.usage ?? json.result?.usage;

    return {
      content,
      usage: usage
        ? {
            promptTokens: parseInt(String(usage.prompt_tokens ?? usage.inputTextTokens ?? 0), 10),
            completionTokens: parseInt(
              String(usage.completion_tokens ?? usage.completionTokens ?? 0),
              10,
            ),
            totalTokens: parseInt(String(usage.total_tokens ?? usage.totalTokens ?? 0), 10),
          }
        : undefined,
    };
  }
}
