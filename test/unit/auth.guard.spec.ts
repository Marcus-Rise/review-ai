import { createHmac } from 'node:crypto';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '../../src/auth/auth.guard';
import { ClientsConfigService } from '../../src/auth/clients-config.service';
import { ClientConfig } from '../../src/auth/clients-config.interface';

const mockClient: ClientConfig = {
  client_id: 'test-client',
  api_key: 'test-key-123',
  client_secret: 'test-secret',
  gitlab_token: 'glpat-test',
  gitlab_base_url: 'https://gitlab.example.com',
  enabled: true,
  allowed_endpoints: ['/api/v1/reviews/run'],
  rate_limit: { requests: 1, per_seconds: 60 },
};

function createMockContext(
  headers: Record<string, string>,
  url = '/api/v1/reviews/run',
): ExecutionContext {
  const request = {
    headers,
    url,
    body: {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let clientsConfig: ClientsConfigService;

  beforeEach(() => {
    clientsConfig = {
      getClient: jest.fn(),
      findByApiKey: jest.fn(),
      isLoaded: jest.fn().mockReturnValue(true),
    } as unknown as ClientsConfigService;
    guard = new AuthGuard(clientsConfig);
  });

  it('should reject missing Authorization header', () => {
    const ctx = createMockContext({ 'x-client-id': 'test-client' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject missing X-Client-Id header', () => {
    const ctx = createMockContext({ authorization: 'Bearer test-key-123' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject unknown client', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(undefined);
    const ctx = createMockContext({
      authorization: 'Bearer test-key-123',
      'x-client-id': 'unknown',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject disabled client', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue({ ...mockClient, enabled: false });
    const ctx = createMockContext({
      authorization: 'Bearer test-key-123',
      'x-client-id': 'test-client',
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject wrong API key', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);
    const ctx = createMockContext({
      authorization: 'Bearer wrong-key',
      'x-client-id': 'test-client',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject disallowed endpoint', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);
    const ctx = createMockContext(
      { authorization: 'Bearer test-key-123', 'x-client-id': 'test-client' },
      '/api/v1/other',
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow valid request', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);
    const ctx = createMockContext({
      authorization: 'Bearer test-key-123',
      'x-client-id': 'test-client',
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should compare api_key in constant time (reject key with correct length but wrong value)', () => {
    // Same length as 'test-key-123' but different — timing-safe check must still reject it
    const sameLength = 'test-key-XXX';
    expect(sameLength.length).toBe(mockClient.api_key.length);
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);
    const ctx = createMockContext({
      authorization: `Bearer ${sameLength}`,
      'x-client-id': 'test-client',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject invalid HMAC signature', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);
    const ctx = createMockContext({
      authorization: 'Bearer test-key-123',
      'x-client-id': 'test-client',
      'x-request-timestamp': '1000',
      'x-request-signature': 'invalid-signature',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject when only x-request-timestamp is present (partial HMAC)', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);
    const ctx = createMockContext({
      authorization: 'Bearer test-key-123',
      'x-client-id': 'test-client',
      'x-request-timestamp': '1000',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should reject when only x-request-signature is present (partial HMAC)', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);
    const ctx = createMockContext({
      authorization: 'Bearer test-key-123',
      'x-client-id': 'test-client',
      'x-request-signature': 'some-signature',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should accept a correctly signed request (contract: HMAC-SHA256(body + timestamp, secret))', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);

    const body = {};
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify(body);
    // Contract: signature = HMAC-SHA256(body + timestamp, client_secret)
    const signature = createHmac('sha256', mockClient.client_secret)
      .update(`${rawBody}${timestamp}`)
      .digest('hex');

    const request = {
      headers: {
        authorization: 'Bearer test-key-123',
        'x-client-id': 'test-client',
        'x-request-timestamp': timestamp,
        'x-request-signature': signature,
      },
      url: '/api/v1/reviews/run',
      body,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
