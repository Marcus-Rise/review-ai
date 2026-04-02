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

function parseBody(send: jest.Mock) {
  return send.mock.calls[0][0];
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

  describe('plain Error (non-HttpException)', () => {
    it('should return 500 with INTERNAL_ERROR code and generic message', () => {
      const { host, status, send } = createMockHost('req-123');
      filter.catch(new Error('GitLab API returned 502'), host);

      expect(status).toHaveBeenCalledWith(500);
      const body = parseBody(send);
      expect(body).toEqual({
        request_id: 'req-123',
        status: 'error',
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error', retryable: false },
      });
    });

    it('should log at error level with message and stack trace', () => {
      const { host } = createMockHost('req-123');
      const error = new Error('GitLab API returned 502');
      filter.catch(error, host);

      expect(errorSpy).toHaveBeenCalledWith('[req-123] GitLab API returned 502', error.stack);
    });
  });

  describe('HttpException — 4xx', () => {
    it('should return 400 with string response message', () => {
      const { host, status, send } = createMockHost('req-400');
      filter.catch(new HttpException('Bad input', HttpStatus.BAD_REQUEST), host);

      expect(status).toHaveBeenCalledWith(400);
      const body = parseBody(send);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toBe('Bad input');
      expect(body.error.retryable).toBe(false);
    });

    it('should extract message from object response', () => {
      const { host, send } = createMockHost();
      filter.catch(
        new HttpException(
          { message: 'Validation failed', statusCode: 400 },
          HttpStatus.BAD_REQUEST,
        ),
        host,
      );

      expect(parseBody(send).error.message).toBe('Validation failed');
    });

    it('should join array message (class-validator errors)', () => {
      const { host, send } = createMockHost();
      filter.catch(
        new HttpException(
          { message: ['field must be string', 'field2 is required'], statusCode: 400 },
          HttpStatus.BAD_REQUEST,
        ),
        host,
      );

      expect(parseBody(send).error.message).toBe('field must be string; field2 is required');
    });

    it('should log 4xx at warn level without stack trace', () => {
      const { host } = createMockHost('req-456');
      filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), host);

      expect(warnSpy).toHaveBeenCalledWith('[req-456] Not found');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should map 429 to RATE_LIMITED with retryable=true', () => {
      const { host, send } = createMockHost();
      filter.catch(new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS), host);

      const body = parseBody(send);
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.retryable).toBe(true);
    });
  });

  describe('HttpException — 5xx', () => {
    it('should return 502 with BAD_GATEWAY code and retryable=true', () => {
      const { host, status, send } = createMockHost('req-502');
      filter.catch(new HttpException('Bad gateway', HttpStatus.BAD_GATEWAY), host);

      expect(status).toHaveBeenCalledWith(502);
      const body = parseBody(send);
      expect(body.error.code).toBe('BAD_GATEWAY');
      expect(body.error.retryable).toBe(true);
    });

    it('should return 503 with SERVICE_UNAVAILABLE code', () => {
      const { host, send } = createMockHost();
      filter.catch(new HttpException('Unavailable', HttpStatus.SERVICE_UNAVAILABLE), host);

      expect(parseBody(send).error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should log 5xx HttpException at error level with stack', () => {
      const { host } = createMockHost('req-789');
      const exception = new HttpException('Bad gateway', HttpStatus.BAD_GATEWAY);
      filter.catch(exception, host);

      expect(errorSpy).toHaveBeenCalledWith('[req-789] Bad gateway', exception.stack);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('non-Error exception', () => {
    it('should return 500 and log stringified value', () => {
      const { host, status } = createMockHost();
      filter.catch({ weird: 'object' }, host);

      expect(status).toHaveBeenCalledWith(500);
      expect(errorSpy).toHaveBeenCalledWith('[unknown] Non-error exception: {"weird":"object"}');
    });

    it('should handle string thrown value', () => {
      const { host } = createMockHost('req-str');
      filter.catch('something went wrong', host);

      expect(errorSpy).toHaveBeenCalledWith(
        '[req-str] Non-error exception: "something went wrong"',
      );
    });

    it('should fall back to String() when JSON.stringify throws (circular reference)', () => {
      const { host, status } = createMockHost('req-circ');
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      filter.catch(circular, host);

      expect(status).toHaveBeenCalledWith(500);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[req-circ] Non-error exception:'),
      );
    });
  });

  describe('statusToCode mapping', () => {
    it.each([
      [400, 'BAD_REQUEST'],
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [409, 'CONFLICT'],
      [429, 'RATE_LIMITED'],
      [500, 'INTERNAL_ERROR'],
      [502, 'BAD_GATEWAY'],
      [503, 'SERVICE_UNAVAILABLE'],
    ])('should map HTTP %d to code %s', (httpStatus, expectedCode) => {
      const { host, send } = createMockHost();
      filter.catch(new HttpException('msg', httpStatus), host);
      expect(parseBody(send).error.code).toBe(expectedCode);
    });

    it('should fall back to ERROR for unmapped status codes', () => {
      const { host, send } = createMockHost();
      filter.catch(new HttpException('msg', 418), host);
      expect(parseBody(send).error.code).toBe('ERROR');
    });
  });

  describe('requestId handling', () => {
    it('should use "unknown" when requestId is missing', () => {
      const { host, send } = createMockHost();
      filter.catch(new Error('oops'), host);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[unknown]'),
        expect.any(String),
      );
      expect(parseBody(send).request_id).toBe('unknown');
    });

    it('should include requestId in log and response when present', () => {
      const { host, send } = createMockHost('abc-def');
      filter.catch(new Error('fail'), host);

      expect(errorSpy).toHaveBeenCalledWith('[abc-def] fail', expect.any(String));
      expect(parseBody(send).request_id).toBe('abc-def');
    });
  });
});
