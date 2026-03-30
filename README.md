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
- GitLab access token with API scope

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

Two provider modes are supported — choose one:

### Option A: Amvera (cloud, default in `docker-compose.yml`)

```bash
cp secrets/clients.example.json secrets/clients.json
# Edit secrets/clients.json — set real api_key and client_secret

# Add your Amvera API key
echo "your-amvera-token" > secrets/model-api-key.txt

# Set MODEL_PROVIDER=amvera and MODEL_NAME in docker-compose.yml (already default)
docker compose up -d

curl http://localhost:3000/healthz
```

Supported Amvera models: `gpt-5`, `gpt-4.1`, `deepseek-R1`, `deepseek-V3`, `qwen3_30b`, `qwen3_235b`.

### Option B: Ollama (self-hosted)

```bash
cp secrets/clients.example.json secrets/clients.json
# In docker-compose.yml: set MODEL_PROVIDER=openai, MODEL_ENDPOINT=http://model:11434, MODEL_NAME=qwen2.5-coder:1.5b

docker compose up -d

# Pull the model (first time only)
docker exec ai-review-model ollama pull qwen2.5-coder:1.5b

curl http://localhost:3000/healthz
```

## Docker (Service Only)

```bash
docker build -t ai-review-service .

# With Amvera provider
docker run -d \
  -p 3000:3000 \
  -e MODEL_PROVIDER=amvera \
  -e MODEL_NAME=gpt-5 \
  -e MODEL_API_KEY_PATH=/run/secrets/model-api-key.txt \
  -e CLIENTS_CONFIG_PATH=/run/secrets/clients.json \
  -v /path/to/clients.json:/run/secrets/clients.json:ro \
  -v /path/to/model-api-key.txt:/run/secrets/model-api-key.txt:ro \
  ai-review-service

# With Ollama (self-hosted)
docker run -d \
  -p 3000:3000 \
  -e MODEL_PROVIDER=openai \
  -e MODEL_ENDPOINT=http://your-model-host:11434 \
  -e MODEL_NAME=qwen2.5-coder:1.5b \
  -e CLIENTS_CONFIG_PATH=/run/secrets/clients.json \
  -v /path/to/clients.json:/run/secrets/clients.json:ro \
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

### Ollama Hardware Requirements

Ollama runs models locally. Minimum requirements depend on model size:

| Model | Parameters | RAM (CPU) | VRAM (GPU) | Notes |
|-------|:----------:|:---------:|:----------:|-------|
| `qwen2.5-coder:1.5b` | 1.5B | 4 GB | 2 GB | Fastest, basic quality |
| `qwen2.5-coder:7b` | 7B | 8 GB | 6 GB | Good balance for code review |
| `qwen2.5-coder:14b` | 14B | 16 GB | 10 GB | Higher quality findings |
| `qwen2.5-coder:32b` | 32B | 32 GB | 24 GB | Best quality, slow on CPU |
| `codellama:13b` | 13B | 16 GB | 10 GB | Meta's code-focused model |
| `deepseek-coder-v2:16b` | 16B | 16 GB | 12 GB | Strong at code reasoning |

**GPU vs CPU:**
- **With GPU (NVIDIA):** Models run 5–20x faster. Recommended for 7B+ models. Requires `nvidia-container-toolkit` for Docker.
- **CPU only:** Viable for 1.5B–7B models. 14B+ models will be very slow (minutes per review).
- **Apple Silicon (M1/M2/M3):** Ollama uses Metal acceleration natively. 7B–14B models work well.

**Recommendation:** Start with `qwen2.5-coder:7b` (best quality/speed ratio). Use `1.5b` for testing, `14b+` if you have a GPU.

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
      "base_url": "https://gitlab.example.com",
      "project_path": "group/project",
      "mr_iid": 123,
      "token": "<gitlab_access_token>"
    },
    "review": {
      "mode": "mr",
      "dry_run": false,
      "profile": "default | security | thorough",
      "user_focus": "Pay attention to auth logic"
    }
  }'
```

The GitLab token can also be passed via header instead of the body:

```bash
curl -X POST http://localhost:3000/api/v1/reviews/run \
  -H "Authorization: Bearer <api_key>" \
  -H "X-Client-Id: gitlab-review-job" \
  -H "X-GitLab-Token: glpat-xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{ "api_version": "v1", "gitlab": { "base_url": "...", "project_path": "...", "mr_iid": 123 }, "review": { "mode": "mr" } }'
```

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
- `GITLAB_REVIEW_TOKEN`

## Security

- API key + client ID authentication
- Optional HMAC-SHA256 request signing (both timestamp and signature headers required when using HMAC)
- Per-client rate limits and endpoint allowlists
- GitLab tokens handled in-memory only, never logged
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
