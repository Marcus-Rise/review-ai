import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { FastifyRequest, FastifyReply } from 'fastify';

export const REQUEST_ID_HEADER = 'X-Request-Id';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const requestId = (request.headers[REQUEST_ID_HEADER.toLowerCase()] as string) || randomUUID();

    (request as unknown as Record<string, unknown>)['requestId'] = requestId;
    reply.header(REQUEST_ID_HEADER, requestId);

    return next.handle();
  }
}
