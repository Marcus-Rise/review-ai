---
paths:
  - "src/**/*.spec.ts"
  - "test/**/*.ts"
---

# Testing

- Unit tests alongside source: `src/**/*.spec.ts`
- E2e tests in `test/` with `jest-e2e.json` config
- Mock NestJS providers with `{ provide: ServiceName, useValue: mockObject }`
- Do not mock `ConfigService` — use `@nestjs/config` `ConfigModule.forRoot({ load: [...] })` with test config
- `pnpm test` for unit; `pnpm test:e2e` for e2e (needs running deps)
- Coverage: `pnpm test:cov`
- Prefer `jest.fn()` stubs over deep mocking frameworks
- Test one behavior per `it()` block; describe block = class or method under test

## TDD workflow (mandatory)

Always write the failing test first, then implement the fix:
1. Write test → verify it fails (`pnpm test`)
2. Implement fix → verify test passes
3. Run full suite → no regressions
4. Commit + push

Order: e2e first if the behavior is observable at HTTP level, integration if it needs wired deps, unit otherwise.

## Logger mocking in unit tests

Unit tests use a global setup (`test/jest.setup.ts`, registered via `setupFilesAfterEnv` in `jest.config.ts`) that silences `Logger.prototype` output. To assert on logger calls within a test:

```typescript
import { Logger } from '@nestjs/common';

const errorSpy = jest.spyOn(Logger.prototype, 'error');
const warnSpy  = jest.spyOn(Logger.prototype, 'warn');

// happy path:
expect(errorSpy).not.toHaveBeenCalled();

// error path:
expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('some message'));
```

`jest.restoreAllMocks()` in `afterEach` (global setup) resets spies between tests.