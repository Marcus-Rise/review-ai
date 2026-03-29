# Testing

## Test Stack

- **Jest** — unit and integration tests
- **Supertest / Fastify inject** — e2e / smoke tests
- **pnpm test** — unit tests
- **pnpm test:e2e** — e2e tests
- **pnpm test:cov** — coverage report

## Test Categories

| Category | Location | What it tests |
|----------|----------|---------------|
| Auth guard | `test/unit/auth.guard.spec.ts` | API key validation, HMAC, disabled clients, endpoint allowlist |
| Client config loading | `test/unit/clients-config.service.spec.ts` | JSON parsing, validation, missing files |
| Rate limiting | `test/unit/rate-limit.service.spec.ts` | Per-client limits, per-MR limits, TTL expiry |
| Idempotency | `test/unit/idempotency.service.spec.ts` | Cache store/retrieve, TTL expiration |
| Prompt sanitization | `test/unit/sanitize.util.spec.ts` | Injection patterns, length limits, control chars |
| GitLab adapter | `test/unit/gitlab.service.spec.ts` | Mocked fetch calls, pagination, URL encoding |
| Decision engine | `test/unit/decision-engine.spec.ts` | Skip/reply/new/suggestion decisions |
| Publisher | `test/unit/publisher.service.spec.ts` | Payload building, dry-run, GitLab API calls |
| Model output | `test/unit/model.service.spec.ts` | JSON parsing, validation, invalid output handling |
| Health endpoints | `test/e2e/health.e2e-spec.ts` | /healthz and /readyz responses |
| Review flow | `test/e2e/review-run.e2e-spec.ts` | Auth rejection, validation, help endpoint |

## Running Tests

```bash
# All unit tests
pnpm test

# With coverage
pnpm test:cov

# E2E tests
pnpm test:e2e

# Watch mode
pnpm test:watch
```

## CI Integration

Tests run on every push/PR via GitHub Actions (`.github/workflows/ci.yml`).
