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

## Server Requirements

### Primary scenario: review-ai + Amvera (cloud LLM)

The service is a lightweight Node.js container that proxies requests between GitLab and the Amvera model API. No local LLM, no GPU, no heavy computation — just HTTPS I/O.

**What the service does per request:**
1. Принимает HTTP-запрос (~1 KB)
2. Делает 4 GET-запроса к GitLab API (MR metadata + diff + discussions + versions)
3. Отправляет POST к Amvera API (prompt ≤17 KB, ответ 5–20 KB)
4. Публикует результаты обратно в GitLab (POST ×N findings)

Всё — I/O-bound. CPU простаивает 99% времени запроса.

#### VPS requirements (service + Amvera)

| Resource | Minimum | Recommended | Why |
|----------|---------|-------------|-----|
| **CPU** | 1 vCPU | 1 vCPU | Single-threaded Node.js event loop, ~20 ms CPU на запрос |
| **RAM** | 512 MB | 1 GB | Node.js ~50 MB + Docker ~200 MB + кэши ~5 MB + буферы diff ~20 MB |
| **Disk** | 3 GB | 5 GB | OS ~1 GB + Docker engine ~500 MB + образ ~400 MB + логи |
| **OS** | Any Linux with Docker | Ubuntu 22.04+ / Debian 12+ | Alpine-based image, работает на любом ядре 5.x+ |
| **Network** | Outbound HTTPS | Outbound HTTPS | К GitLab + к `kong-proxy.yc.amvera.ru`, ~100–700 KB на запрос |
| **Public IP** | Не обязателен | Не обязателен | Нужен только если GitLab CI дергает сервис по IP/домену |

#### Breakdown: что потребляет ресурсы

| Компонент | CPU | RAM | Disk |
|-----------|-----|-----|------|
| Docker engine | ~1% idle | ~150 MB | ~500 MB |
| Node.js 22 runtime | ~0% idle | ~30 MB | — |
| NestJS + Fastify + Pino | — | ~20 MB | — |
| In-memory кэши (rate limit, idempotency) | — | 1–5 MB | 0 |
| Docker-образ review-ai | — | — | ~400 MB |
| **Итого (idle)** | **~1%** | **~200 MB** | **~2 GB** |
| **Итого (под нагрузкой, 5 одновременных запросов)** | **~3–5%** | **~300 MB** | **~2 GB** |

#### Что НЕ влияет на выбор сервера

- **Disk speed** — нет БД, нет записи на диск (read-only контейнер с tmpfs)
- **GPU** — не нужен, ML-инференс на стороне Amvera
- **Multi-core** — Node.js однопоточный, второе ядро не ускорит сервис
- **Bandwidth** — трафик минимален (~100–700 KB на запрос, <1 MB/мин при 10 ревью/час)

#### Типичный VPS

Самый дешёвый VPS на любом хостинге (1 vCPU, 1 GB RAM, 10 GB SSD, ~$5/мес) — достаточно с запасом.

### Alternative: review-ai + Ollama (self-hosted LLM)

При локальном LLM модель потребляет значительно больше, чем сам сервис. Требования к серверу определяются моделью:

| Setup | Total RAM | Total CPU | Total Disk |
|-------|:---------:|:---------:|:----------:|
| Service + Ollama 1.5B (CPU) | 5 GB | 2 vCPU | 10 GB |
| Service + Ollama 7B (CPU) | 10 GB | 4 vCPU | 15 GB |
| Service + Ollama 7B (GPU) | 4 GB + 6 GB VRAM | 2 vCPU + GPU | 15 GB |
| Service + Ollama 14B (CPU) | 18 GB | 4–8 vCPU | 20 GB |

See README [Ollama Models — CPU Only](../README.md#ollama-models--cpu-only-no-gpu) for per-model details.

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
