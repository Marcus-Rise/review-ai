# Security

## Authentication

### Inbound (GitLab Job → Service)

**Required:**
- `Authorization: Bearer <api_key>` — matches client config
- `X-Client-Id: <client_id>` — identifies the client

**Optional HMAC:**
- `X-Request-Timestamp: <unix_timestamp>` — must be within 5 minutes
- `X-Request-Signature: HMAC_SHA256(body + timestamp, client_secret)` — hex-encoded

### Outbound (Service → GitLab)

- GitLab token passed per-request in the body (`gitlab.token`)
- Handled in-memory only
- Never logged (redacted by Pino)
- Supports project, group, or personal access tokens with API scope

## Secret Management

- Client credentials stored in a mounted JSON file
- Path configured via `CLIENTS_CONFIG_PATH` env variable
- Loaded once at startup, kept in-memory
- Rotation: replace file + restart container

## Logging Redaction

The following fields are automatically redacted:
- `req.headers.authorization`
- `req.headers["x-request-signature"]`
- `req.body.gitlab.token`

## Prompt Injection Protection

The `user_focus` field is sanitized:
- Max 500 characters
- Stripped of control characters
- Rejected if matching known injection patterns (e.g., "ignore previous instructions")
- Inserted as advisory context only, never merged into system rules

## Container Hardening

- Runs as non-root user (`appuser:1001`)
- Read-only root filesystem (with tmpfs for /tmp)
- No unnecessary Linux capabilities
- Health endpoints for orchestration

## Rate Limiting

- Per-client + per-target MR rate limits
- Global per-client process-level limit
- Idempotency-Key support to prevent duplicate reviews
