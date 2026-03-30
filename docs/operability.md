# Operability

## Health Endpoints

| Endpoint | Purpose | Expected response |
|----------|---------|-------------------|
| `GET /healthz` | Liveness | `200` with `{ "status": "ok" }` |
| `GET /readyz` | Readiness | `200` with check results |

Readiness checks:
- `clients_loaded` — client auth config loaded successfully
- `model_provider_configured` — `MODEL_PROVIDER` env var set (defaults to `openai`)
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

## Server Requirements (review-ai service only, without LLM model)

The service is stateless, I/O-bound (waits on GitLab API and model API), and has minimal CPU/RAM footprint. The bottleneck is always network latency to external APIs, not the service itself.

### Minimum server (hobby / small team, <10 reviews/day)

| Resource | Requirement |
|----------|-------------|
| CPU | 1 vCPU |
| RAM | 1 GB |
| Disk | 5 GB (OS + Docker + image ~400 MB) |
| OS | Any Linux with Docker (Alpine, Ubuntu, Debian) |
| Network | Public IP or NAT with outbound HTTPS |

### Recommended server (team / CI, 10–100 reviews/day)

| Resource | Requirement |
|----------|-------------|
| CPU | 2 vCPU |
| RAM | 2 GB |
| Disk | 10 GB |
| OS | Ubuntu 22.04+ / Debian 12+ |
| Network | Stable outbound to GitLab and model API |

### What consumes resources

| Component | CPU | RAM | Disk | Network |
|-----------|-----|-----|------|---------|
| Node.js 22 + NestJS/Fastify | Idle ~0% | ~50 MB baseline | 0 (read-only fs) | — |
| In-memory caches (rate limit, idempotency) | — | 1–5 MB | 0 | — |
| Swagger UI (if enabled) | — | ~1 MB | 0 | — |
| Docker image | — | — | ~400 MB | — |
| Docker engine + OS | ~1–3% | 200–500 MB | 2–4 GB | — |
| Per review request | ~20 ms CPU | ~5–20 MB (diff buffers) | 0 | 100–700 KB |

### What does NOT matter

- **Disk speed** — no database, no persistent writes, container is read-only with tmpfs for `/tmp`
- **GPU** — the service itself does zero ML inference (model runs externally)
- **Multi-core scaling** — Node.js single-threaded event loop; 1 vCPU is enough unless you run Ollama on the same machine

### When to add Ollama on the same server

If running Ollama alongside the review-ai service (self-hosted LLM), add the model's requirements on top:

| Setup | Total RAM | Total CPU | Total Disk |
|-------|:---------:|:---------:|:----------:|
| Service + Amvera (cloud model) | 1–2 GB | 1–2 vCPU | 5–10 GB |
| Service + Ollama 1.5B (CPU) | 5 GB | 2 vCPU | 10 GB |
| Service + Ollama 7B (CPU) | 10 GB | 4 vCPU | 15 GB |
| Service + Ollama 7B (GPU) | 4 GB + 6 GB VRAM | 2 vCPU + GPU | 15 GB |
| Service + Ollama 14B (CPU) | 18 GB | 4–8 vCPU | 20 GB |

### Hosting examples

| Provider | Plan | Specs | Enough for |
|----------|------|-------|------------|
| Any VPS | Minimal | 1 vCPU, 1 GB RAM, 10 GB SSD | Service + Amvera |
| Any VPS | Medium | 2 vCPU, 4 GB RAM, 20 GB SSD | Service + Ollama 1.5B |
| Any VPS | Large | 4 vCPU, 8 GB RAM, 40 GB SSD | Service + Ollama 7B (CPU) |
| GPU VPS | GPU | 2 vCPU, 4 GB RAM, 8 GB VRAM | Service + Ollama 7B–14B (GPU) |

## Deployment

### Docker Compose (recommended)

```bash
# Ollama (default):
docker compose up -d
docker exec ai-review-model ollama pull qwen2.5-coder:7b

# Amvera (cloud):
docker compose -f docker-compose.amvera.yml up -d
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
