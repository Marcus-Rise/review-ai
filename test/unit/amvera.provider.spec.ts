import { ConfigService } from '@nestjs/config';
import { AmveraProvider } from '../../src/model/providers/amvera.provider';

describe('AmveraProvider', () => {
  let configService: ConfigService;

  const baseRequest = {
    model: 'deepseek-R1',
    systemPrompt: 'You are a reviewer',
    userPrompt: 'Review this code',
    temperature: 0.1,
    jsonMode: false,
  };

  const gptResponse = (content: string) => ({
    choices: [{ message: { role: 'assistant', content: content } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  });

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, def?: unknown) => {
        const map: Record<string, unknown> = {
          MODEL_TIMEOUT_MS: '5000',
        };
        return map[key] ?? def;
      }),
    } as unknown as ConfigService;
  });

  it('should route model to correct endpoint path', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{}')),
    });

    await provider.complete(baseRequest);

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://kong-proxy.yc.amvera.ru/api/v1/models/deepseek');
  });

  it('should throw for unknown model', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    await expect(provider.complete({ ...baseRequest, model: 'unknown-model' })).rejects.toThrow(
      'Unknown Amvera model "unknown-model"',
    );
  });

  it('should send X-Auth-Token header', async () => {
    const provider = new AmveraProvider(configService, 'my-secret-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{}')),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['X-Auth-Token']).toBe('Bearer my-secret-token');
  });

  it('should use content field in messages (OpenAI-compatible format)', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{}')),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are a reviewer' },
      { role: 'user', content: 'Review this code' },
    ]);
  });

  it('should use reasoning_effort for reasoning models (gpt-5)', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{}')),
    });

    await provider.complete({ ...baseRequest, model: 'gpt-5' });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.temperature).toBeUndefined();
    expect(body.reasoning_effort).toBe('low');
  });

  it('should send temperature for non-reasoning models', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{}')),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.temperature).toBe(0.1);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('should send response_format when jsonMode is true', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{}')),
    });

    await provider.complete({ ...baseRequest, jsonMode: true });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('should parse response with content field', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{"findings":[]}')),
    });

    const result = await provider.complete(baseRequest);
    expect(result.content).toBe('{"findings":[]}');
  });

  it('should fallback to content field in response', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { role: 'assistant', content: 'fallback-content' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
    });

    const result = await provider.complete(baseRequest);
    expect(result.content).toBe('fallback-content');
  });

  it('should parse usage as numbers', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{}')),
    });

    const result = await provider.complete(baseRequest);
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
  });

  it('should throw on HTTP error', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(provider.complete(baseRequest)).rejects.toThrow('Model API returned 403');
  });

  it('should return empty content when choices are empty', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    });

    const result = await provider.complete(baseRequest);
    expect(result.content).toBe('');
    expect(result.usage).toBeUndefined();
  });

  it('should use custom endpoint when MODEL_ENDPOINT is set', async () => {
    const customConfig = {
      get: jest.fn((key: string, def?: unknown) => {
        const map: Record<string, unknown> = {
          MODEL_ENDPOINT: 'https://custom.amvera.example/api/v1',
          MODEL_TIMEOUT_MS: '5000',
        };
        return map[key] ?? def;
      }),
    } as unknown as ConfigService;
    const provider = new AmveraProvider(customConfig, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(gptResponse('{}')),
    });

    await provider.complete(baseRequest);

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://custom.amvera.example/api/v1/models/deepseek');
  });

  it('should map all supported models to correct paths', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    const modelPaths: Record<string, string> = {
      'gpt-4.1': '/models/gpt',
      'gpt-5': '/models/gpt',
      'deepseek-R1': '/models/deepseek',
      'deepseek-V3': '/models/deepseek',
      qwen3_30b: '/models/qwen',
      qwen3_235b: '/models/qwen',
    };

    for (const [model, expectedPath] of Object.entries(modelPaths)) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(gptResponse('{}')),
      });

      await provider.complete({ ...baseRequest, model });

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`https://kong-proxy.yc.amvera.ru/api/v1${expectedPath}`);
    }
  });
});
