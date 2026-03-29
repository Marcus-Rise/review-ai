import { Injectable, Logger } from '@nestjs/common';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly globalStore = new Map<string, RateLimitEntry>();

  private static readonly GLOBAL_LIMIT = 30;
  private static readonly GLOBAL_WINDOW_SECONDS = 60;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }

  checkLimit(
    clientId: string,
    projectPath: string,
    mrIid: number,
    maxRequests: number,
    perSeconds: number,
  ): { allowed: boolean; retryAfterSeconds?: number } {
    // Check global rate limit first
    const globalResult = this.checkGlobalLimit(clientId);
    if (!globalResult.allowed) {
      return globalResult;
    }

    const key = `${clientId}:${projectPath}:${mrIid}`;
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + perSeconds * 1000 });
      return { allowed: true };
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      this.logger.warn(`Rate limit hit for ${key}: ${entry.count}/${maxRequests}`);
      return { allowed: false, retryAfterSeconds: retryAfter };
    }

    entry.count++;
    return { allowed: true };
  }

  private checkGlobalLimit(clientId: string): {
    allowed: boolean;
    retryAfterSeconds?: number;
  } {
    const now = Date.now();
    const entry = this.globalStore.get(clientId);

    if (!entry || now >= entry.resetAt) {
      this.globalStore.set(clientId, {
        count: 1,
        resetAt: now + RateLimitService.GLOBAL_WINDOW_SECONDS * 1000,
      });
      return { allowed: true };
    }

    if (entry.count >= RateLimitService.GLOBAL_LIMIT) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return { allowed: false, retryAfterSeconds: retryAfter };
    }

    entry.count++;
    return { allowed: true };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) this.store.delete(key);
    }
    for (const [key, entry] of this.globalStore) {
      if (now >= entry.resetAt) this.globalStore.delete(key);
    }
  }
}
