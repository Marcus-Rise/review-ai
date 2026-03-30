# API Contracts

## Endpoints

### `POST /api/v1/reviews/run`

Primary MVP endpoint. Runs AI review on a GitLab merge request.

**Headers:**
- `Authorization: Bearer <api_key>` (required)
- `X-Client-Id: <client_id>` (required)
- `X-Request-Timestamp: <unix_timestamp>` (optional, for HMAC — must be paired with signature)
- `X-Request-Signature: <hmac_sha256>` (optional, for HMAC — must be paired with timestamp)
- `Idempotency-Key: <unique_key>` (optional)

**Request Body:**
```json
{
  "api_version": "v1",
  "gitlab": {
    "project_path": "group/project",
    "mr_iid": 123,
    "base_sha": "optional",
    "head_sha": "optional"
  },
  "review": {
    "mode": "mr",
    "dry_run": false,
    "profile": "default",
    "user_focus": "optional advisory text (max 500 chars)"
  }
}
```

**Response (200):**
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
  "actions": [
    {
      "type": "new_discussion_with_suggestion",
      "path": "src/foo.ts",
      "line": 42,
      "discussion_id": "...",
      "reason": "Safe local fix available: correctness"
    }
  ],
  "warnings": [],
  "errors": []
}
```

`status` values:
- `"ok"` — all actions completed successfully
- `"partial"` — some actions succeeded, but some failed to publish (see `errors` array)
- `"error"` — request-level failure

When `status` is `"partial"`, the `errors` array contains one entry per failed action:
```json
{
  "errors": [
    { "path": "src/bar.ts", "line": 15, "error": "GitLab API returned 500" }
  ]
}
```
```

**Error Response:**
```json
{
  "request_id": "uuid",
  "status": "error",
  "error": {
    "code": "BAD_REQUEST",
    "message": "description",
    "retryable": false
  }
}
```

### `GET /api/v1/reviews/help`

Returns human-readable help and usage summary. No authentication required.

### `GET /healthz`

Liveness check. Returns `{ "status": "ok", "timestamp": "..." }`.

### `GET /readyz`

Readiness check. Returns checks for client config loaded, model endpoint configured.

### `GET /docs`

Swagger / OpenAPI documentation (when `SWAGGER_ENABLED=true`).

## Validation Rules

- `api_version` must be `"v1"`
- `gitlab.mr_iid` is required
- GitLab token and base URL are configured per client in `clients.json` (not passed in the request)
- Either `gitlab.project_path` or `gitlab.project_id` must be provided
- `review.mode` must be `"mr"`
- `review.profile` must be `"default"`, `"security"`, or `"thorough"`
- `review.user_focus` max 500 characters, sanitized against prompt injection
- Unknown fields are rejected (`forbidNonWhitelisted`)

## Action Types

- `new_discussion` — new inline comment on a specific line (or general MR note if model marks it as not suitable for inline)
- `new_discussion_with_suggestion` — inline comment with a `suggestion` code block
- `reply` — reply to an existing discussion thread
- `skip` — finding matched existing unresolved discussion, no action taken

## Context Bounding

The service automatically bounds the review context sent to the model. Limits are **provider-specific** — cloud providers with gateway body size restrictions get tighter limits, while local/OpenAI-compatible models get generous defaults.

### Common filtering (all providers)

- Binary and generated files are filtered out (`.min.js`, `.lock`, `.map`, image formats, etc.)
- Files under `vendor/`, `node_modules/`, `dist/`, `.yarn/` are excluded
- Truncation warnings are included in the response `warnings` array

### Provider-specific limits

| Limit | `openai` (Ollama, OpenAI, Groq) | `amvera` (cloud) |
|-------|:-------------------------------:|:----------------:|
| Max files per review | 50 | 20 |
| Max diff chars per file | 10,000 | 4,000 |
| Max total diff chars | 100,000 | 12,000 |
| Max total diff bytes (UTF-8) | — | 13,000 |

**Why the difference?** Amvera uses a Kong gateway proxy with a ~17 KB request body limit (in bytes, not characters). Multi-byte characters (e.g. Cyrillic = 2 bytes/char in UTF-8) can cause the byte count to significantly exceed the character count. The byte limit prevents overflow for non-ASCII content. Local models (Ollama) and direct OpenAI API have no such restriction.

Limits are selected automatically based on `MODEL_PROVIDER` env variable.
