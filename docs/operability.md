# Operability

## Health Endpoints

| Endpoint | Purpose | Expected response |
|----------|---------|-------------------|
| `GET /healthz` | Liveness | `200` with `{ "status": "ok" }` |
| `GET /readyz` | Readiness | `200` with check results |

Readiness checks:
- `clients_loaded` — client auth config loaded successfully
- `model_endpoint_configured` — `MODEL_ENDPOINT` env var set
- `model_name_configured` — `MODEL_NAME` env var set

## Logging

Structured JSON logs via Pino:
- Development: pretty-printed with colors
- Production: JSON format for log aggregation

Log levels: `debug`, `info`, `warn`, `error` (set via `LOG_LEVEL` env).

### Redacted fields
- `Authorization` header
- `X-Request-Signature` header
- `gitlab.token` in request body

### Correlation
Every request gets a UUID (`X-Request-Id` header). The ID is included in logs and responses.

## Deployment

### Docker Compose (recommended)

```bash
docker compose up -d
# If using Ollama provider (MODEL_PROVIDER=openai with local model):
docker exec ai-review-model ollama pull qwen2.5-coder:1.5b
```

### Secret Rotation

1. Update `secrets/clients.json` with new credentials
2. Restart the service: `docker compose restart ai-review-service`

No hot-reload — restart is required.

### Monitoring

- Use `/healthz` for Docker/Compose/LB health checks
- Use `/readyz` to verify the service is fully initialized
- Monitor structured logs for error patterns

## In-Memory State

The following state resets on restart:
- Rate limit counters
- Idempotency cache
- Client config (reloaded from file)

## Graceful Shutdown

The service handles `SIGTERM` via NestJS shutdown hooks. In-flight requests complete before exit.
