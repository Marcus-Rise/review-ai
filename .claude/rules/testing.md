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