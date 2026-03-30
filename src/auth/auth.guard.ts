import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { ClientsConfigService } from './clients-config.service';
import { verifyHmacSignature } from './hmac.util';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(private readonly clientsConfig: ClientsConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers['authorization'];
    const clientId = request.headers['x-client-id'] as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    if (!clientId) {
      throw new UnauthorizedException('Missing X-Client-Id header');
    }

    const apiKey = authHeader.slice(7);
    const client = this.clientsConfig.getClient(clientId);

    if (!client) {
      this.logger.warn(`Unknown client_id: ${clientId}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!client.enabled) {
      this.logger.warn(`Disabled client attempted access: ${clientId}`);
      throw new ForbiddenException('Client is disabled');
    }

    const keyMatch =
      client.api_key.length === apiKey.length &&
      timingSafeEqual(Buffer.from(client.api_key), Buffer.from(apiKey));
    if (!keyMatch) {
      this.logger.warn(`Invalid API key for client: ${clientId}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check endpoint allowlist
    const url = request.url.split('?')[0];
    if (!client.allowed_endpoints.some((ep) => url.startsWith(ep))) {
      this.logger.warn(`Client ${clientId} not allowed to access ${url}`);
      throw new ForbiddenException('Endpoint not allowed for this client');
    }

    // Optional HMAC verification
    const timestamp = request.headers['x-request-timestamp'] as string | undefined;
    const signature = request.headers['x-request-signature'] as string | undefined;

    if (!!timestamp !== !!signature) {
      throw new UnauthorizedException(
        'Incomplete HMAC headers: both x-request-timestamp and x-request-signature are required when either is present',
      );
    }

    if (timestamp && signature) {
      // Note: We use JSON.stringify(body) rather than the raw HTTP payload because
      // Fastify parses the body before guards execute and does not expose rawBody
      // by default. Clients must sign the canonical JSON serialization of the body.
      const rawBody = JSON.stringify(request.body || '');
      const result = verifyHmacSignature(rawBody, timestamp, signature, client.client_secret);
      if (!result.valid) {
        this.logger.warn(`HMAC verification failed for client ${clientId}: ${result.reason}`);
        throw new UnauthorizedException(`HMAC verification failed: ${result.reason}`);
      }
    }

    // Attach client info to request for downstream use
    (request as unknown as Record<string, unknown>)['client'] = client;

    return true;
  }
}
