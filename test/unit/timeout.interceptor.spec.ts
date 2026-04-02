import { CallHandler, ExecutionContext, RequestTimeoutException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, delay, firstValueFrom } from 'rxjs';
import { TimeoutInterceptor } from '../../src/common/timeout.interceptor';

describe('TimeoutInterceptor', () => {
  function createInterceptor(timeoutMs?: number): TimeoutInterceptor {
    const configService = {
      get: jest.fn().mockReturnValue(timeoutMs ?? 300_000),
    } as unknown as ConfigService;
    return new TimeoutInterceptor(configService);
  }

  const mockContext = {} as ExecutionContext;

  it('should pass through when response completes within timeout', async () => {
    const interceptor = createInterceptor(5000);
    const next: CallHandler = { handle: () => of('ok') };

    const result = await firstValueFrom(interceptor.intercept(mockContext, next));
    expect(result).toBe('ok');
  });

  it('should throw RequestTimeoutException when timeout exceeded', async () => {
    const interceptor = createInterceptor(50);
    const next: CallHandler = { handle: () => of('ok').pipe(delay(200)) };

    await expect(firstValueFrom(interceptor.intercept(mockContext, next))).rejects.toThrow(
      RequestTimeoutException,
    );
  });

  it('should propagate non-timeout errors unchanged', async () => {
    const interceptor = createInterceptor(5000);
    const next: CallHandler = {
      handle: () => {
        throw new Error('original error');
      },
    };

    expect(() => interceptor.intercept(mockContext, next)).toThrow('original error');
  });

  it('should use default timeout of 300000ms when config is not set', () => {
    const configService = {
      get: jest.fn().mockReturnValue(300_000),
    } as unknown as ConfigService;
    const interceptor = new TimeoutInterceptor(configService);
    expect(configService.get).toHaveBeenCalledWith('REQUEST_TIMEOUT_MS', 300_000);
    expect(interceptor).toBeDefined();
  });
});
