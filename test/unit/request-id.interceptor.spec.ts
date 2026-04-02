import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { RequestIdInterceptor, REQUEST_ID_HEADER } from '../../src/common/request-id.interceptor';

describe('RequestIdInterceptor', () => {
  let interceptor: RequestIdInterceptor;

  beforeEach(() => {
    interceptor = new RequestIdInterceptor();
  });

  function createMockContext(incomingRequestId?: string) {
    const request: Record<string, unknown> = {
      headers: incomingRequestId ? { [REQUEST_ID_HEADER.toLowerCase()]: incomingRequestId } : {},
    };
    const headerFn = jest.fn();
    const reply = { header: headerFn };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => reply,
      }),
    } as unknown as ExecutionContext;
    return { context, request, headerFn };
  }

  const next: CallHandler = { handle: () => of('result') };

  it('should generate a UUID when no X-Request-Id header is present', (done) => {
    const { context, request, headerFn } = createMockContext();

    interceptor.intercept(context, next).subscribe(() => {
      const id = request['requestId'] as string;
      expect(id).toBeDefined();
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(headerFn).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
      done();
    });
  });

  it('should reuse incoming X-Request-Id header when present', (done) => {
    const { context, request, headerFn } = createMockContext('incoming-id-123');

    interceptor.intercept(context, next).subscribe(() => {
      expect(request['requestId']).toBe('incoming-id-123');
      expect(headerFn).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'incoming-id-123');
      done();
    });
  });

  it('should pass through to next handler', (done) => {
    const { context } = createMockContext();

    interceptor.intercept(context, next).subscribe((result) => {
      expect(result).toBe('result');
      done();
    });
  });
});
