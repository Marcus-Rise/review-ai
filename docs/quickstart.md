# Quick Start Guide

End-to-end guide: from zero to your first AI review on a real GitLab MR.

## Option A: Docker Compose (recommended)

### 1. Prepare secrets

```bash
cp secrets/clients.example.json secrets/clients.json
```

Edit `secrets/clients.json` — set your own `api_key` and `client_secret`:

```json
{
  "clients": [
    {
      "client_id": "gitlab-review-job",
      "api_key": "my-test-key-123",
      "client_secret": "my-test-secret-456",
      "enabled": true,
      "allowed_endpoints": ["/api/v1/reviews/run"],
      "rate_limit": {
        "requests": 5,
        "per_seconds": 60
      }
    }
  ]
}
```

### 2. Start services

```bash
docker compose up -d
```

Wait for Ollama to become healthy, then pull a model:

```bash
# Default (~4GB, needs ~8GB RAM)
docker exec ai-review-model ollama pull qwen2.5-coder:7b

# Lightweight alternative (~1GB, needs ~4GB RAM)
docker exec ai-review-model ollama pull qwen2.5-coder:1.5b
```

> If using a non-default model, update `MODEL_NAME` in `docker-compose.yml`.

### 3. Verify

```bash
curl http://localhost:3000/healthz
# {"status":"ok","timestamp":"..."}

curl http://localhost:3000/readyz
# {"status":"ok","checks":{...}}
```

### 4. Create a GitLab access token

In your GitLab instance:

1. Go to **project** (or group) → **Settings → Access Tokens**
2. Create a token with:
   - **Role:** Developer or higher
   - **Scopes:** `api`
3. Copy the token (starts with `glpat-...`)

### 5. Run a dry-run review

Replace the values with your own:

```bash
curl -s http://localhost:3000/api/v1/reviews/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-test-key-123" \
  -H "X-Client-Id: gitlab-review-job" \
  -d '{
    "api_version": "v1",
    "gitlab": {
      "base_url": "https://your-gitlab.example.com",
      "project_path": "your-group/your-project",
      "mr_iid": 42,
      "token": "glpat-xxxxxxxxxxxx"
    },
    "review": {
      "mode": "mr",
      "dry_run": true,
      "profile": "default"
    }
  }' | python3 -m json.tool
```

> **Start with `dry_run: true`** — the service will show what it _would_ post to GitLab without actually creating any discussions.
>
> **Tip:** You can pass the GitLab token via `X-GitLab-Token` header instead of `gitlab.token` in the body.

### 6. Run a real review

Once you're happy with the dry-run output, switch to `dry_run: false`:

```bash
curl -s http://localhost:3000/api/v1/reviews/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-test-key-123" \
  -H "X-Client-Id: gitlab-review-job" \
  -d '{
    "api_version": "v1",
    "gitlab": {
      "base_url": "https://your-gitlab.example.com",
      "project_path": "your-group/your-project",
      "mr_iid": 42,
      "token": "glpat-xxxxxxxxxxxx"
    },
    "review": {
      "mode": "mr",
      "dry_run": false,
      "profile": "default"
    }
  }' | python3 -m json.tool
```

Check your MR in GitLab — you should see inline review comments.

---

## Option B: Local development (no Docker)

### 1. Install and configure

```bash
pnpm install
cp .env.example .env
cp secrets/clients.example.json secrets/clients.json
```

Edit `.env`:

```env
MODEL_ENDPOINT=http://localhost:11434
MODEL_NAME=qwen2.5-coder:7b
CLIENTS_CONFIG_PATH=./secrets/clients.json
```

Edit `secrets/clients.json` as shown above.

### 2. Start Ollama separately

```bash
# Install Ollama: https://ollama.com/download
ollama serve
ollama pull qwen2.5-coder:7b
```

### 3. Start the service

```bash
pnpm start:dev
```

### 4. Send a review request

Same curl commands as above, targeting `http://localhost:3000`.

---

## Review profiles

Three profiles are available, each with a different review focus:

| Profile | Focus |
|---------|-------|
| `default` | Balanced: correctness, security, tests, contracts, architecture |
| `security` | Security-focused: auth flaws, injection, data exposure, crypto |
| `thorough` | Deep analysis: edge cases, error handling, race conditions, performance |

```bash
# Security-focused review
"profile": "security"

# Thorough review
"profile": "thorough"
```

## Developer focus hint

Optionally guide the reviewer with a free-text hint (advisory only, max 500 chars):

```bash
"user_focus": "Pay attention to the redirect logic and query param handling"
```

The hint is sanitized against prompt injection — it cannot override system rules or output format.

## Idempotency

To prevent duplicate reviews on retry, pass an `Idempotency-Key` header:

```bash
curl ... \
  -H "Idempotency-Key: mr-42-review-$(date +%Y%m%d)" \
  ...
```

The service caches responses by this key (in-memory, 5 min TTL).

## Understanding the response

```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "ok",
  "summary": {
    "findings_considered": 8,
    "actions_published": 3,
    "replies_posted": 1,
    "skipped_duplicates": 4,
    "dry_run": false
  },
  "actions": [
    {
      "type": "new_discussion",
      "path": "src/auth.ts",
      "line": 42,
      "reason": "security — high"
    },
    {
      "type": "new_discussion_with_suggestion",
      "path": "src/utils.ts",
      "line": 15,
      "reason": "Safe local fix available: correctness"
    }
  ],
  "warnings": [],
  "errors": []
}
```

| Field | Meaning |
|-------|---------|
| `status` | `"ok"` — all actions succeeded; `"partial"` — some failed (see `errors`); `"error"` — request-level failure |
| `findings_considered` | Total findings returned by the model |
| `actions_published` | Discussions/replies actually posted to GitLab |
| `replies_posted` | Replies to existing discussion threads |
| `skipped_duplicates` | Findings skipped because an unresolved discussion already covers the topic |
| `dry_run` | Whether this was a dry run (no GitLab writes) |
| `warnings` | Context bounding warnings (e.g., files filtered, diffs truncated) |
| `errors` | Per-action publish failures: `[{ path, line, error }]` |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `401 Unauthorized` | Check `Authorization` header and `X-Client-Id` match `secrets/clients.json` |
| `429 Too Many Requests` | Rate limit hit — wait or increase `rate_limit.requests` in client config |
| `MODEL_ENDPOINT and MODEL_NAME must be configured` | Set env vars or check `.env` |
| Model returns empty findings | Model may be too small — try a larger model (7b+) |
| `Connection refused` on model | Ensure Ollama is running and accessible from the service container |
| Suggestions not appearing | Only created when the fix is local, small, and safe — not for broad issues |
| `status: "partial"` in response | Some discussions failed to publish — check `errors` array for details |
| `warnings` mentions truncation | MR is large; some files/diffs were bounded to fit the model context |

## Next step: GitLab CI integration

Once manual testing works, set up the GitLab CI job. See [`.gitlab-ci.yml.example`](../.gitlab-ci.yml.example) and the [GitLab CI Integration](#) section in the README.
