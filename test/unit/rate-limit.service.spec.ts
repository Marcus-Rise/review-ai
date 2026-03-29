import { RateLimitService } from '../../src/rate-limit/rate-limit.service';

describe('RateLimitService', () => {
  let service: RateLimitService;

  beforeEach(() => {
    service = new RateLimitService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should allow first request', () => {
    const result = service.checkLimit('client1', 'group/project', 1, 1, 60);
    expect(result.allowed).toBe(true);
  });

  it('should block second request within window', () => {
    service.checkLimit('client1', 'group/project', 1, 1, 60);
    const result = service.checkLimit('client1', 'group/project', 1, 1, 60);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('should allow different MR targets independently', () => {
    const r1 = service.checkLimit('client1', 'group/project', 1, 1, 60);
    const r2 = service.checkLimit('client1', 'group/project', 2, 1, 60);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it('should allow different clients independently', () => {
    const r1 = service.checkLimit('client1', 'group/project', 1, 1, 60);
    const r2 = service.checkLimit('client2', 'group/project', 1, 1, 60);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it('should respect custom limits', () => {
    service.checkLimit('client1', 'group/project', 1, 3, 60);
    service.checkLimit('client1', 'group/project', 1, 3, 60);
    const r3 = service.checkLimit('client1', 'group/project', 1, 3, 60);
    expect(r3.allowed).toBe(true);

    const r4 = service.checkLimit('client1', 'group/project', 1, 3, 60);
    expect(r4.allowed).toBe(false);
  });
});
