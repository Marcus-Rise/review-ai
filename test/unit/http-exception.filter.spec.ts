import { ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../src/common/http-exception.filter';

function createMockHost(requestId?: string) {
  const send = jest.fn();
  const status = jest.fn().mockReturnValue({ send });
  const request = { requestId };
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost,
    status,
    send,
  };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    errorSpy = jest.spyOn(Logger.prototype, 'error');
    warnSpy = jest.spyOn(Logger.prototype, 'warn');
  });

  it('should log plain Error at error level with stack trace and return 500', () => {
    const { host, status, send } = createMockHost('req-123');
    const error = new Error('GitLab API returned 502');

    filter.catch(error, host);

    expect(errorSpy).toHaveBeenCalledWith('[req-123] GitLab API returned 502', error.stack);
    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        request_id: 'req-123',
        status: 'error',
        error: expect.objectContaining({
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        }),
      }),
    );
  });

  it('should log 4xx HttpException at warn level', () => {
    const { host, status } = createMockHost('req-456');
    const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(warnSpy).toHaveBeenCalledWith('[req-456] Bad request');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });

  it('should log 5xx HttpException at error level with stack', () => {
    const { host, status } = createMockHost('req-789');
    const exception = new HttpException('Bad gateway', HttpStatus.BAD_GATEWAY);

    filter.catch(exception, host);

    expect(errorSpy).toHaveBeenCalledWith('[req-789] Bad gateway', exception.stack);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(502);
  });

  it('should log non-Error exception with JSON.stringify', () => {
    const { host } = createMockHost();
    const thrown = { weird: 'object' };

    filter.catch(thrown, host);

    expect(errorSpy).toHaveBeenCalledWith('[unknown] Non-error exception: {"weird":"object"}');
  });

  it('should use "unknown" when requestId is missing', () => {
    const { host, send } = createMockHost();
    filter.catch(new Error('oops'), host);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[unknown]'), expect.any(String));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ request_id: 'unknown' }));
  });
});
