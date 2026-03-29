import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '../../src/auth/auth.guard';
import { ClientsConfigService } from '../../src/auth/clients-config.service';
import { ClientConfig } from '../../src/auth/clients-config.interface';

const mockClient: ClientConfig = {
  client_id: 'test-client',
  api_key: 'test-key-123',
  client_secret: 'test-secret',
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

  it('should validate HMAC when headers present', () => {
    (clientsConfig.getClient as jest.Mock).mockReturnValue(mockClient);
    const ctx = createMockContext({
      authorization: 'Bearer test-key-123',
      'x-client-id': 'test-client',
      'x-request-timestamp': '1000',
      'x-request-signature': 'invalid-signature',
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
