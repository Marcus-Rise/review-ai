import { Module, Global } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  providers: [RateLimitService, IdempotencyService],
  exports: [RateLimitService, IdempotencyService],
})
export class RateLimitModule {}
