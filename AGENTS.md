# review-ai — Codex project rules

## Stack

- NestJS 11 + Fastify, TypeScript strict
- `pnpm` only
- Unit tests live in `src/**/*.spec.ts`
- E2E tests live in `test/`
- Logging via `nestjs-pino`; use `new Logger(ClassName.name)` in services

## General working rules

- Inspect existing modules and local rules before editing
- Make the smallest viable targeted change
- Do not modify unrelated code
- Prefer project-local conventions over generic NestJS defaults

## Module conventions

- Each feature should stay shaped as `Module + Service + optional Controller + local .types.ts`
- Use native `fetch` for HTTP calls, not `axios`
- Read config through `ConfigService`; do not use `process.env` directly inside services
- Shared interfaces, filters, guards, and interceptors belong in `src/common/`
- DTO validation belongs at controller boundaries with `ValidationPipe`

## Auth and secrets

- API clients are authenticated via HMAC-SHA256 under `src/auth/`
- Client configs are loaded from `CLIENTS_CONFIG_PATH`
- Never log HMAC secrets, tokens, or client config secrets
- Idempotency keys must stay scoped by `client_id`

## Model integration

- The service talks to an OpenAI-compatible endpoint via `/v1/chat/completions`
- Use `MODEL_ENDPOINT` and `MODEL_NAME` from configuration; do not hardcode model routing
- Structured model output should use `response_format: { type: 'json_object' }`
- When you need current OpenAI or Codex API details, use the `openaiDeveloperDocs` MCP server first

## GitLab integration

- All GitLab API access should go through `GitLabService`
- Support both `project_path` and `project_id`
- Encode path-based identifiers with `encodeURIComponent`
- Prefer inline diff discussions when publishing review feedback

## Runtime and Docker

- Base image conventions: `node:22-alpine`, pnpm 10 installed via `npm install -g pnpm@10`
- Do not rely on `corepack` in Alpine images
- Ship production `node_modules`; do not depend on `pnpm prune --prod`
- Set `APP_ENV=production` in Docker builds to avoid runtime logger issues
- Healthchecks should use `node -e "fetch(...)"`, not `curl` or `wget`
- Parse numeric env values explicitly before passing them into Fastify options

## Validation

Run the narrowest relevant checks first:

```bash
pnpm lint
pnpm format:check
pnpm tsc:check
pnpm test
pnpm test:e2e
pnpm build
```
