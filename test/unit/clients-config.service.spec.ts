import { ClientsConfigService } from '../../src/auth/clients-config.service';
import { ConfigService } from '@nestjs/config';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ClientsConfigService', () => {
  let service: ClientsConfigService;
  let configService: ConfigService;
  let tmpFile: string;

  beforeEach(async () => {
    const tmpDir = join(tmpdir(), 'ai-review-test');
    await mkdir(tmpDir, { recursive: true });
    tmpFile = join(tmpDir, `clients-${Date.now()}.json`);
    configService = {
      get: jest.fn().mockReturnValue(tmpFile),
    } as unknown as ConfigService;
    service = new ClientsConfigService(configService);
  });

  afterEach(async () => {
    await unlink(tmpFile).catch(() => {});
  });

  it('should load valid config file', async () => {
    const config = {
      clients: [
        {
          client_id: 'test',
          api_key: 'key123',
          client_secret: 'secret',
          enabled: true,
          allowed_endpoints: ['/api/v1/reviews/run'],
          rate_limit: { requests: 1, per_seconds: 60 },
        },
      ],
    };
    await writeFile(tmpFile, JSON.stringify(config));
    await service.loadConfig();

    expect(service.isLoaded()).toBe(true);
    expect(service.getClient('test')).toBeDefined();
    expect(service.getClient('test')?.api_key).toBe('key123');
  });

  it('should reject config without clients array', async () => {
    await writeFile(tmpFile, JSON.stringify({ invalid: true }));
    await expect(service.loadConfig()).rejects.toThrow('missing "clients" array');
  });

  it('should reject client without client_id', async () => {
    await writeFile(tmpFile, JSON.stringify({ clients: [{ api_key: 'key' }] }));
    await expect(service.loadConfig()).rejects.toThrow('missing valid client_id');
  });

  it('should handle missing config path gracefully', async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);
    await service.loadConfig();
    expect(service.isLoaded()).toBe(true);
  });

  it('should reject client with missing rate_limit', async () => {
    const config = {
      clients: [
        {
          client_id: 'test',
          api_key: 'key123',
          client_secret: 'secret',
          enabled: true,
          allowed_endpoints: ['/api/v1/reviews/run'],
        },
      ],
    };
    await writeFile(tmpFile, JSON.stringify(config));
    await expect(service.loadConfig()).rejects.toThrow('missing or invalid rate_limit');
  });

  it('should reject client with invalid rate_limit values', async () => {
    const config = {
      clients: [
        {
          client_id: 'test',
          api_key: 'key123',
          client_secret: 'secret',
          enabled: true,
          allowed_endpoints: ['/api/v1/reviews/run'],
          rate_limit: { requests: 0, per_seconds: -1 },
        },
      ],
    };
    await writeFile(tmpFile, JSON.stringify(config));
    await expect(service.loadConfig()).rejects.toThrow('missing or invalid rate_limit');
  });

  it('should find client by API key', async () => {
    const config = {
      clients: [
        {
          client_id: 'c1',
          api_key: 'key1',
          client_secret: 'secret',
          enabled: true,
          allowed_endpoints: [],
          rate_limit: { requests: 1, per_seconds: 60 },
        },
      ],
    };
    await writeFile(tmpFile, JSON.stringify(config));
    await service.loadConfig();

    expect(service.findByApiKey('key1')?.client_id).toBe('c1');
    expect(service.findByApiKey('unknown')).toBeUndefined();
  });
});
