import { Injectable, Logger } from '@nestjs/common';

interface CacheEntry {
  response: unknown;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }

  getCached(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    this.logger.debug(`Idempotency cache hit: ${key}`);
    return entry.response;
  }

  store(key: string, response: unknown, ttlMs: number = DEFAULT_TTL_MS) {
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) this.cache.delete(key);
    }
  }
}
