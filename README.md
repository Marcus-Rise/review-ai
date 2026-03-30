# AI Review Service

Self-hosted AI code review service for **GitLab Self-Managed Free Tier 18.19**.

Triggered by a manual GitLab CI job, the service:

1. Authenticates the incoming request
2. Fetches merge request context from GitLab API
3. Calls a coding model via OpenAI-compatible API (self-hosted Ollama or cloud provider)
4. Decides what review output is appropriate
5. Publishes review results back to GitLab as inline discussions, suggestions, or replies

## Architecture

```
GitLab CI Job → [Auth] → [GitLab Adapter] → [Context Builder] → [Model Adapter]
                                                                       ↓
              [Publisher] ← [Decision Engine] ← [Model Findings]
                  ↓
           GitLab MR Discussions
```

8 logical layers: Ingress, Auth, GitLab Adapter, Context Builder, Model Adapter, Decision Engine, Publisher, Audit/Logging.

See [docs/architecture.md](docs/architecture.md) for details.

## Prerequisites

- Node.js 22 LTS
- pnpm
- Docker & Docker Compose (for deployment)
- Model provider: self-hosted (e.g., Ollama) **or** cloud (e.g., Amvera)
- GitLab access token with API scope (configured per client in `clients.json`)

## Quick Start (Local Development)

> **Full step-by-step guide:** [docs/quickstart.md](docs/quickstart.md) — from zero to your first AI review on a real GitLab MR.

```bash
# Install dependencies
pnpm install

# Copy example configs
cp .env.example .env
cp secrets/clients.example.json secrets/clients.json

# Edit secrets/clients.json with your API keys

# Start in development mode
pnpm start:dev
```

The service will be available at `http://localhost:3000`.

- Swagger docs: `http://localhost:3000/docs`
- Health: `http://localhost:3000/healthz`
- Readiness: `http://localhost:3000/readyz`

## Docker Compose (Service + Model)

Each provider has its own compose file — no commented-out blocks to toggle.

### Option A: Ollama (self-hosted, default)

```bash
cp secrets/clients.example.json secrets/clients.json
# Edit secrets/clients.json — set real api_key and client_secret

docker compose up -d
# or explicitly: docker compose -f docker-compose.ollama.yml up -d

# Pull the model (first time only)
docker exec ai-review-model ollama pull qwen2.5-coder:7b

curl http://localhost:3000/healthz
```

### Option B: Amvera (cloud)

```bash
cp secrets/clients.example.json secrets/clients.json
# Edit secrets/clients.json — set real api_key and client_secret

# Add your Amvera API key
echo "your-amvera-token" > secrets/model-api-key.txt

docker compose -f docker-compose.amvera.yml up -d

curl http://localhost:3000/healthz
```

Supported Amvera models: `gpt-5`, `gpt-4.1`, `deepseek-R1`, `deepseek-V3`, `qwen3_30b`, `qwen3_235b`.

## Docker (Service Only)

```bash
docker build -t ai-review-service .

# With Amvera provider
docker run -d \
  -p 3000:3000 \
  -e MODEL_PROVIDER=amvera \
  -e MODEL_NAME=gpt-5 \
  -e MODEL_API_KEY_PATH=/run/secrets/model-api-key \
  -e CLIENTS_CONFIG_PATH=/run/secrets/clients-config \
  -v /path/to/clients.json:/run/secrets/clients-config:ro \
  -v /path/to/model-api-key.txt:/run/secrets/model-api-key:ro \
  ai-review-service

# With Ollama (self-hosted)
docker run -d \
  -p 3000:3000 \
  -e MODEL_PROVIDER=openai \
  -e MODEL_ENDPOINT=http://your-model-host:11434 \
  -e MODEL_NAME=qwen2.5-coder:7b \
  -e CLIENTS_CONFIG_PATH=/run/secrets/clients-config \
  -v /path/to/clients.json:/run/secrets/clients-config:ro \
  ai-review-service
```

## Provider Comparison

| Capability | `openai` (Ollama / OpenAI / Groq) | `amvera` (cloud) |
|------------|:---------------------------------:|:----------------:|
| Self-hosted | Yes (Ollama) / No (OpenAI, Groq) | No |
| API key required | No (Ollama) / Yes (OpenAI, Groq) | Yes |
| Max files per review | 50 | 20 |
| Max diff chars/file | 10,000 | 4,000 |
| Max total diff chars | 100,000 | 12,000 |
| Request body limit | Unlimited (local) | ~17 KB (Kong gateway) |
| Latency | Depends on hardware | 5–60s depending on model |
| Cost | Free (Ollama) / Pay-per-token | Pay-per-request |

Limits are applied automatically by `ContextBuilderService` based on `MODEL_PROVIDER`.

### Ollama Models — CPU Only (no GPU)

Most affordable setup: any modern x86 machine with enough RAM. All models run on CPU via Ollama, but speed varies significantly with model size.

| Model | Parameters | RAM needed | Speed (CPU) | Review quality | Best for |
|-------|:----------:|:----------:|:-----------:|:--------------:|----------|
| `qwen2.5-coder:1.5b` | 1.5B | 4 GB | ~5 tok/s, ~30s/review | Low | Testing, CI smoke tests |
| `qwen2.5-coder:7b` | 7B | 8 GB | ~2 tok/s, ~2 min/review | Medium | **Recommended for CPU** |
| `codellama:7b` | 7B | 8 GB | ~2 tok/s, ~2 min/review | Medium | Alternative to Qwen 7B |
| `qwen2.5-coder:14b` | 14B | 16 GB | ~1 tok/s, ~5 min/review | Good | Dedicated review server |
| `deepseek-coder-v2:16b` | 16B | 20 GB | ~0.8 tok/s, ~7 min/review | Good | Strong reasoning on CPU |
| `qwen2.5-coder:32b` | 32B | 36 GB | ~0.4 tok/s, ~15 min/review | High | Not practical on CPU |
| `codellama:34b` | 34B | 38 GB | ~0.3 tok/s, ~18 min/review | High | Not practical on CPU |

> Speeds measured on a typical 8-core x86 CPU (Xeon/Ryzen). Actual performance varies with CPU generation, RAM speed, and diff size.

**CPU-only recommendations:**
- **4 GB RAM** → `qwen2.5-coder:1.5b` (fast but basic findings)
- **8 GB RAM** → `qwen2.5-coder:7b` (best quality/speed trade-off)
- **16+ GB RAM** → `qwen2.5-coder:14b` (if you can tolerate ~5 min reviews)
- **32B+ models** → not practical on CPU, use GPU or switch to Amvera

### Ollama Models — With GPU

GPU accelerates inference 5–20x. Requires `nvidia-container-toolkit` for Docker.

| Model | Parameters | VRAM needed | Speed (GPU) | Review quality |
|-------|:----------:|:-----------:|:-----------:|:--------------:|
| `qwen2.5-coder:1.5b` | 1.5B | 2 GB | ~60 tok/s, ~3s/review | Low |
| `qwen2.5-coder:7b` | 7B | 6 GB | ~30 tok/s, ~8s/review | Medium |
| `qwen2.5-coder:14b` | 14B | 10 GB | ~15 tok/s, ~15s/review | Good |
| `qwen2.5-coder:32b` | 32B | 24 GB | ~8 tok/s, ~30s/review | High |
| `deepseek-coder-v2:16b` | 16B | 12 GB | ~12 tok/s, ~18s/review | Good |
| `codellama:34b` | 34B | 24 GB | ~7 tok/s, ~35s/review | High |

**Apple Silicon (M1/M2/M3/M4):** Ollama uses Metal acceleration natively. 7B–14B models work well. Performance is between CPU and discrete GPU.

### Amvera Supported Models

| Model | Type | Notes |
|-------|------|-------|
| `gpt-5` | Reasoning | Uses `reasoning_effort: "low"` to avoid 60s timeout |
| `gpt-4.1` | Standard | Good general-purpose |
| `deepseek-R1` | Reasoning | DeepSeek reasoning model |
| `deepseek-V3` | Standard | DeepSeek standard |
| `qwen3_30b` | Standard | Alibaba Qwen 30B |
| `qwen3_235b` | Standard | Alibaba Qwen 235B |

See [docs/providers/amvera/findings.md](docs/providers/amvera/findings.md) for API specifics.

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | Environment (`development` / `production`) |
| `PORT` | `3000` | HTTP port |
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `SWAGGER_ENABLED` | `true` | Enable Swagger UI |
| `CLIENTS_CONFIG_PATH` | — | Path to client auth JSON file |
| `MODEL_PROVIDER` | `openai` | Provider: `openai` (Ollama/OpenAI-compatible) or `amvera` |
| `MODEL_ENDPOINT` | — | Model API base URL (auto-derived for known providers) |
| `MODEL_NAME` | — | Model name to use |
| `MODEL_API_KEY_PATH` | — | Path to file containing model API key (required for Amvera) |
| `MODEL_TIMEOUT_MS` | `120000` | Model call timeout in ms |
| `REQUEST_BODY_LIMIT` | `1048576` | Max request body size in bytes (1MB) |
| `REQUEST_TIMEOUT_MS` | `300000` | Global request timeout in ms (5min) |

### Client Auth Config

Loaded from `CLIENTS_CONFIG_PATH` (JSON file):

```json
{
  "clients": [
    {
      "client_id": "gitlab-review-job",
      "api_key": "<secure random key>",
      "client_secret": "<secure random secret>",
      "gitlab_token": "<gitlab access token with api scope>",
      "gitlab_base_url": "https://gitlab.example.com",
      "enabled": true,
      "allowed_endpoints": ["/api/v1/reviews/run"],
      "rate_limit": { "requests": 1, "per_seconds": 60 }
    }
  ]
}
```

## API Usage

### Run a Review

```bash
curl -X POST http://localhost:3000/api/v1/reviews/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api_key>" \
  -H "X-Client-Id: gitlab-review-job" \
  -d '{
    "api_version": "v1",
    "gitlab": {
      "project_path": "group/project",
      "mr_iid": 123
    },
    "review": {
      "mode": "mr",
      "dry_run": false,
      "profile": "default | security | thorough",
      "user_focus": "Pay attention to auth logic"
    }
  }'
```

> **Note:** The GitLab token and base URL are configured per client in `clients.json` — they are not passed in the request.

### Response

```json
{
  "request_id": "uuid",
  "status": "ok",
  "summary": {
    "findings_considered": 8,
    "actions_published": 3,
    "replies_posted": 1,
    "skipped_duplicates": 4,
    "dry_run": false
  },
  "actions": [...],
  "warnings": [],
  "errors": []
}
```

`status` is `"ok"`, `"partial"` (some actions failed to publish), or `"error"`. When `"partial"`, the `errors` array contains `{ path, line, error }` entries for each failed action.

## GitLab CI Integration

See [.gitlab-ci.yml.example](.gitlab-ci.yml.example) for a ready-to-use manual job.

Required CI/CD secret variables:
- `AI_REVIEW_SERVICE_URL`
- `AI_REVIEW_API_KEY`
- `AI_REVIEW_CLIENT_ID`

## Security

- API key + client ID authentication
- Optional HMAC-SHA256 request signing (both timestamp and signature headers required when using HMAC)
- Per-client rate limits and endpoint allowlists
- GitLab tokens stored per client in config, handled in-memory only
- User focus field sanitized against prompt injection
- Non-root container, read-only filesystem

See [docs/security.md](docs/security.md).

## Testing

```bash
pnpm test        # Unit tests
pnpm test:e2e    # E2E tests
pnpm test:cov    # Coverage report
```

## No-Database Limitations

This MVP operates without a database:

- **State resets on restart** — rate limits, idempotency cache clear on restart
- **Secret rotation requires restart** — replace the JSON file, restart the container
- **No persistent audit log** — review history is in structured logs only
- **In-memory rate limits** — reset on process restart

## Future Extensions

The architecture supports adding:

- GitLab webhook entrypoint
- `@bot` mention handling
- Additional review profiles (current: `default`, `security`, `thorough`)
- Persistent storage for rate limits / idempotency
- Secret hot-reload
- Queue-based execution
