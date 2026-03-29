# AI Review Service

Self-hosted AI code review service for **GitLab Self-Managed Free Tier 18.19**.

Triggered by a manual GitLab CI job, the service:

1. Authenticates the incoming request
2. Fetches merge request context from GitLab API
3. Calls a self-hosted coding model (OpenAI-compatible)
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
- Self-hosted model with OpenAI-compatible API (e.g., Ollama)
- GitLab access token with API scope

## Quick Start (Local Development)

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

Run both the AI review service and Ollama model with one command:

```bash
# Copy and edit secrets
cp secrets/clients.example.json secrets/clients.json
# Edit secrets/clients.json — set real api_key and client_secret

# Start everything
docker compose up -d

# Pull the model (first time only)
docker exec ai-review-model ollama pull qwen2.5-coder:7b

# Check health
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
```

### Changing the model

Edit `MODEL_NAME` in `docker-compose.yml` and pull the new model:

```bash
docker exec ai-review-model ollama pull <model-name>
```

## Docker (Service Only)

```bash
docker build -t ai-review-service .

docker run -d \
  -p 3000:3000 \
  -e MODEL_ENDPOINT=http://your-model-host:11434 \
  -e MODEL_NAME=qwen2.5-coder:7b \
  -e CLIENTS_CONFIG_PATH=/run/secrets/clients.json \
  -v /path/to/clients.json:/run/secrets/clients.json:ro \
  ai-review-service
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | Environment (`development` / `production`) |
| `PORT` | `3000` | HTTP port |
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |
| `SWAGGER_ENABLED` | `true` | Enable Swagger UI |
| `CLIENTS_CONFIG_PATH` | — | Path to client auth JSON file |
| `MODEL_ENDPOINT` | — | Model API base URL (OpenAI-compatible) |
| `MODEL_NAME` | — | Model name to use |
| `MODEL_TIMEOUT_MS` | `120000` | Model call timeout in ms |

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
      "profile": "default",
      "user_focus": "Pay attention to auth logic"
    }
  }'
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
  "warnings": []
}
```

## GitLab CI Integration

See [.gitlab-ci.yml.example](.gitlab-ci.yml.example) for a ready-to-use manual job.

Required CI/CD secret variables:
- `AI_REVIEW_SERVICE_URL`
- `AI_REVIEW_API_KEY`
- `AI_REVIEW_CLIENT_ID`
- `GITLAB_REVIEW_TOKEN`

## Security

- API key + client ID authentication
- Optional HMAC-SHA256 request signing
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
- Additional review profiles
- Persistent storage for rate limits / idempotency
- Secret hot-reload
- Queue-based execution
