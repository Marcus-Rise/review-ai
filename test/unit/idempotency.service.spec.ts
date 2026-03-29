import { IdempotencyService } from '../../src/rate-limit/idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should return undefined for unknown key', () => {
    expect(service.getCached('unknown')).toBeUndefined();
  });

  it('should store and retrieve cached response', () => {
    const response = { status: 'ok' };
    service.store('key1', response);
    expect(service.getCached('key1')).toEqual(response);
  });

  it('should expire after TTL', () => {
    jest.useFakeTimers();
    service.store('key1', { status: 'ok' }, 1000);
    expect(service.getCached('key1')).toBeDefined();

    jest.advanceTimersByTime(1001);
    expect(service.getCached('key1')).toBeUndefined();
    jest.useRealTimers();
  });
});
