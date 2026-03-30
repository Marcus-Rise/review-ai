import { ConfigService } from '@nestjs/config';
import { OpenAiProvider } from '../../src/model/providers/openai.provider';

describe('OpenAiProvider', () => {
  let configService: ConfigService;

  const baseRequest = {
    model: 'gpt-4o',
    systemPrompt: 'You are a reviewer',
    userPrompt: 'Review this code',
    temperature: 0.1,
    jsonMode: false,
  };

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, def?: unknown) => {
        const map: Record<string, unknown> = {
          MODEL_TIMEOUT_MS: '5000',
        };
        return map[key] ?? def;
      }),
      getOrThrow: jest.fn((key: string) => {
        const map: Record<string, string> = {
          MODEL_ENDPOINT: 'http://localhost:11434',
        };
        const val = map[key];
        if (!val) throw new Error(`Missing ${key}`);
        return val;
      }),
    } as unknown as ConfigService;
  });

  it('should send request without Authorization when no apiKey', async () => {
    const provider = new OpenAiProvider(configService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"findings":[]}' } }],
        }),
    });

    await provider.complete(baseRequest);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('should send Authorization header when apiKey is provided', async () => {
    const provider = new OpenAiProvider(configService, 'sk-test-key');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{}' } }],
        }),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer sk-test-key');
  });

  it('should include response_format when jsonMode is true', async () => {
    const provider = new OpenAiProvider(configService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{}' } }],
        }),
    });

    await provider.complete({ ...baseRequest, jsonMode: true });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('should not include response_format when jsonMode is false', async () => {
    const provider = new OpenAiProvider(configService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{}' } }],
        }),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.response_format).toBeUndefined();
  });

  it('should map usage from OpenAI format', async () => {
    const provider = new OpenAiProvider(configService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'hello' } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
    });

    const result = await provider.complete(baseRequest);
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it('should throw on HTTP error', async () => {
    const provider = new OpenAiProvider(configService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal error'),
    });

    await expect(provider.complete(baseRequest)).rejects.toThrow('Model API returned 500');
  });

  it('should return empty content when choices are empty', async () => {
    const provider = new OpenAiProvider(configService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    });

    const result = await provider.complete(baseRequest);
    expect(result.content).toBe('');
  });

  it('should send correct message format', async () => {
    const provider = new OpenAiProvider(configService);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{}' } }],
        }),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a reviewer' },
      { role: 'user', content: 'Review this code' },
    ]);
    expect(body.temperature).toBe(0.1);
    expect(body.model).toBe('gpt-4o');
  });
});
