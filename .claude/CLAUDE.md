# review-ai — project rules

## Stack

- NestJS 11 + Fastify, TypeScript strict
- pnpm (never npm or yarn)
- Jest for tests; `test/` for e2e, `src/**/*.spec.ts` for unit
- pino logging via `nestjs-pino`; use `new Logger(ClassName.name)` in services

## Module conventions

- Each feature = NestModule + Service + (optional) Controller + `.types.ts`
- HTTP calls use native `fetch`, not axios
- Config values via `ConfigService` from `@nestjs/config` — never `process.env` directly in services
- `common/` for shared interfaces, guards, filters, interceptors

## Auth

- API clients identified by HMAC-SHA256 signature (see `src/auth/`)
- Client configs loaded from `CLIENTS_CONFIG_PATH` (JSON file mounted as secret)
- Never log token values or HMAC secrets

## Model integration

- OpenAI-compatible endpoint (`/v1/chat/completions`)
- `MODEL_ENDPOINT` + `MODEL_NAME` from env — not hardcoded
- Structured JSON output via `response_format: { type: 'json_object' }`

## GitLab integration

- All GitLab API calls go through `GitLabService`
- `project_path` or `project_id` — both supported, encode with `encodeURIComponent`
- Discussions posted as inline diff notes when possible

## Safety

- Do not log `PRIVATE-TOKEN` or client secrets
- Do not mutate `clients-config` files without explicit request
- Idempotency keys must be scoped by `client_id`

## Docker

- Multi-stage build: `base` → `build` → `production`
- pnpm 10 via `npm install -g pnpm@10` (not corepack — unreliable in Alpine)
- Ship all `node_modules` in production (pnpm prune --prod is unreliable in v10)
- Always set `APP_ENV=production` in Dockerfile to prevent pino-pretty crash
- HEALTHCHECK uses `node -e "fetch(...)"` — not wget/curl (not in Alpine)
- docker-compose: Ollama as model service, depends_on with healthcheck

## Checks after changes

```bash
pnpm lint          # ESLint
pnpm format:check  # Prettier
pnpm tsc:check     # tsc --noEmit
pnpm test          # jest unit
pnpm test:e2e      # jest e2e (requires running deps)
pnpm build         # nest build
```