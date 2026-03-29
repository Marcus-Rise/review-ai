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