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

## Documentation consistency

After **any** code change — not just API changes — check and update docs:

1. **Always check:** `README.md`, `docs/quickstart.md`, `docs/api-contracts.md`, `docs/operability.md`, `docs/providers/*/findings.md`
2. **Specific triggers:**
   - Context limits changed (`MAX_FILES`, `MAX_DIFF_CHARS_PER_FILE`, `MAX_TOTAL_DIFF_CHARS`) → update `docs/api-contracts.md` Context Bounding section
   - Model provider config changed → update `README.md` and `docs/quickstart.md` provider sections
   - New env variable added → update `README.md` Environment Variables table
   - Provider behavior discovered → update `docs/providers/<provider>/findings.md`
3. Update response examples, request schemas, header lists, status values, and error formats
4. Keep curl examples in `docs/quickstart.md` and `README.md` in sync with actual DTO/controller signatures
5. Never leave stale API examples — they mislead integrators more than missing docs

## Responding to PR review comments

When a `<github-webhook-activity>` arrives with a review comment:

1. **Investigate immediately** — read the referenced file and line, understand the reviewer's concern
2. **Check if already fixed** — search recent commits (`git log --oneline -10`) and current code to see if the issue was addressed
3. **If fixed**: post a reply via `mcp__github__add_reply_to_pull_request_comment` explaining what was done (commit ref + brief description). Then attempt to resolve the thread via `mcp__github__resolve_review_thread` (requires `threadId` in `PRT_` GraphQL format — if unavailable, skip silently)
4. **If not fixed and tractable**: fix the code, commit, push, then reply with the fix reference
5. **If ambiguous**: use `AskUserQuestion` before acting — include the reviewer's comment and your interpretation
6. **Batch**: if multiple comments arrive at once, process all before pushing — one commit covering all fixes is preferred over one-per-comment