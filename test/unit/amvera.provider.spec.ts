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

  const amveraResponse = (content: string) => ({
    result: {
      alternatives: [{ message: { role: 'assistant', text: content } }],
      usage: {
        inputTextTokens: '100',
        completionTokens: '50',
        totalTokens: '150',
      },
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
      getOrThrow: jest.fn((key: string) => {
        const map: Record<string, string> = {
          MODEL_ENDPOINT: 'https://kong-proxy.yc.amvera.ru/api/v1',
        };
        const val = map[key];
        if (!val) throw new Error(`Missing ${key}`);
        return val;
      }),
    } as unknown as ConfigService;
  });

  it('should map model to correct endpoint path', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(amveraResponse('{}')),
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
      json: () => Promise.resolve(amveraResponse('{}')),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers['X-Auth-Token']).toBe('Bearer my-secret-token');
  });

  it('should use text field instead of content in messages', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(amveraResponse('{}')),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.messages).toEqual([
      { role: 'system', text: 'You are a reviewer' },
      { role: 'user', text: 'Review this code' },
    ]);
  });

  it('should not send temperature for GPT models', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(amveraResponse('{}')),
    });

    await provider.complete({ ...baseRequest, model: 'gpt-4.1' });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.temperature).toBeUndefined();
  });

  it('should send temperature for non-GPT models', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(amveraResponse('{}')),
    });

    await provider.complete(baseRequest);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.temperature).toBe(0.1);
  });

  it('should send json_mode when jsonMode is true', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(amveraResponse('{}')),
    });

    await provider.complete({ ...baseRequest, jsonMode: true });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.json_mode).toBe(true);
  });

  it('should parse Amvera response format', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(amveraResponse('{"findings":[]}')),
    });

    const result = await provider.complete(baseRequest);
    expect(result.content).toBe('{"findings":[]}');
  });

  it('should convert usage string values to numbers', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(amveraResponse('{}')),
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

  it('should return empty content when response has no alternatives', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: {} }),
    });

    const result = await provider.complete(baseRequest);
    expect(result.content).toBe('');
    expect(result.usage).toBeUndefined();
  });

  it('should map all supported models to correct paths', async () => {
    const provider = new AmveraProvider(configService, 'test-token');

    const modelPaths: Record<string, string> = {
      llama8b: '/models/llama',
      llama70b: '/models/llama',
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
        json: () => Promise.resolve(amveraResponse('{}')),
      });

      await provider.complete({ ...baseRequest, model });

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`https://kong-proxy.yc.amvera.ru/api/v1${expectedPath}`);
    }
  });
});
