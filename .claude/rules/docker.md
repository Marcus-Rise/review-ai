---
paths:
  - "Dockerfile"
  - "docker-compose.yml"
  - ".github/workflows/**"
  - ".dockerignore"
---

# Docker & CI rules

## Dockerfile
- Base image: `node:22-alpine`
- Install pnpm via `npm install -g pnpm@10` — not corepack (fails in Alpine)
- Ship ALL `node_modules` — `pnpm prune --prod` is unreliable in pnpm v10
- Set `APP_ENV=production` and `NODE_ENV=production` — prevents pino-pretty import crash
- HEALTHCHECK: use `node -e "fetch(...)"` — Alpine has no wget/curl by default
- Non-root user: `appuser:appgroup` (1001:1001)
- Multi-stage: `base` → `build` → `production` (don't copy source to production)

## docker-compose.yml
- Model service (Ollama) healthcheck: `ollama list` command
- App service: `depends_on` model with `condition: service_healthy`
- Read-only filesystem with `tmpfs` for `/tmp`
- Secrets: use Compose `secrets:` directive (file-based), not volume bind mounts
- Secret names use hyphens: `clients-config`, `model-api-key`
- Env vars point to `/run/secrets/<secret-name>` (Docker Compose default mount path)

## Runtime env gotchas
- `process.env` values are ALWAYS strings — Fastify and other libs may reject string-typed numbers
- Parse numeric env vars with `parseInt`/`parseFloat` before passing to Fastify options (`bodyLimit`, `connectionTimeout`, etc.)
- Always test app startup locally with production env vars before pushing: `APP_ENV=production NODE_ENV=production timeout 5 node dist/main.js`

## CI Docker smoke test
- Check container status via `docker inspect --format='{{.State.Status}}'`
- Use `docker logs` for diagnostics before assertions
- Healthcheck curl is non-fatal (app may need model connection)
- Always `docker stop` in cleanup even if test fails
