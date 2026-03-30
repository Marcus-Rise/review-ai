# Security

## Authentication

### Inbound (GitLab Job → Service)

**Required:**
- `Authorization: Bearer <api_key>` — matches client config
- `X-Client-Id: <client_id>` — identifies the client

**Optional HMAC:**
- `X-Request-Timestamp: <unix_timestamp>` — must be within 5 minutes
- `X-Request-Signature: HMAC_SHA256(body + timestamp, client_secret)` — hex-encoded

> **Important:** Both HMAC headers must be present together. Sending only one of `X-Request-Timestamp` or `X-Request-Signature` is rejected as a malformed request (401).

### Outbound (Service → GitLab)

- GitLab token stored per client in `clients.json` (`gitlab_token` field)
- Loaded at startup alongside other client credentials
- Handled in-memory only, never logged
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

## HTTP Security Headers

The service registers `@fastify/helmet` to set production security headers on all responses:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | `default-src 'self'` (relaxed for Swagger) | Prevents XSS and data injection |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME-type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS (2-year max-age) |
| `X-DNS-Prefetch-Control` | `off` | Disables DNS prefetching |
| `Referrer-Policy` | `no-referrer` | Prevents referrer leakage |

When Swagger UI is enabled (`SWAGGER_ENABLED=true`), the CSP `style-src` directive includes `'unsafe-inline'` and `img-src` includes `data:` to allow Swagger UI rendering.

No additional environment variables are required.

## Rate Limiting

- Per-client + per-target MR rate limits
- Global per-client process-level limit
- Idempotency-Key support to prevent duplicate reviews
