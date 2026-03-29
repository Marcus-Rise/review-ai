---
paths:
  - "src/**/*.ts"
---

# NestJS conventions

- Use `new Logger(ClassName.name)` — never `console.log`
- Config only via `ConfigService` — never `process.env` directly in services
- HTTP: native `fetch`, not axios
- Each module exports only what other modules need; keep providers internal by default
- DTOs use `class-validator` decorators; always validate at controller boundary with `ValidationPipe`
- Interfaces in `common/interfaces.ts` if shared; local `.types.ts` if module-private
- `@Injectable()` services — keep them stateless where possible (rate-limit state is explicit exception)
- Guards return `true/false` or throw `UnauthorizedException`, not raw booleans with side effects
- Never swallow errors silently — log and rethrow or map to HTTP exception
- `process.env` and `ConfigService.get()` always return **strings** — always parseInt/parseFloat when a number is needed (e.g. Fastify `bodyLimit` requires integer, not string)
- When passing env values to Fastify options, cast explicitly — Fastify does strict type checks and throws on string-typed numbers
- `@nestjs/swagger` with Fastify requires `@fastify/static` as a dependency — without it `SwaggerModule.setup()` crashes the process silently (exit code 1, no log output)