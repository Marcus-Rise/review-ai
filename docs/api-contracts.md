# API Contracts

## Endpoints

### `POST /api/v1/reviews/run`

Primary MVP endpoint. Runs AI review on a GitLab merge request.

**Headers:**
- `Authorization: Bearer <api_key>` (required)
- `X-Client-Id: <client_id>` (required)
- `X-Request-Timestamp: <unix_timestamp>` (optional, for HMAC)
- `X-Request-Signature: <hmac_sha256>` (optional, for HMAC)
- `Idempotency-Key: <unique_key>` (optional)

**Request Body:**
```json
{
  "api_version": "v1",
  "gitlab": {
    "base_url": "https://gitlab.example.com",
    "project_path": "group/project",
    "mr_iid": 123,
    "token": "glpat-...",
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
  "warnings": []
}
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
- `gitlab.base_url` is required
- `gitlab.mr_iid` is required
- `gitlab.token` is required
- Either `gitlab.project_path` or `gitlab.project_id` must be provided
- `review.mode` must be `"mr"`
- `review.profile` must be `"default"`
- `review.user_focus` max 500 characters, sanitized against prompt injection
- Unknown fields are rejected (`forbidNonWhitelisted`)

## Action Types

- `new_discussion` — new inline comment on a specific line
- `new_discussion_with_suggestion` — inline comment with a `suggestion` code block
- `reply` — reply to an existing discussion thread
- `skip` — finding matched existing unresolved discussion, no action taken
