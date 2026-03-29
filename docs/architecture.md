# Architecture

## Overview

The AI Review Service uses a layered architecture with 8 logical layers, each with clear responsibilities and boundaries.

```
┌─────────────────────────────────────────────┐
│           Ingress / API Layer               │
│  (Fastify, validation, rate limits, req ID) │
├─────────────────────────────────────────────┤
│         Auth / Client Config Layer          │
│  (API key, HMAC, client allowlist)          │
├─────────────────────────────────────────────┤
│          GitLab Adapter Layer               │
│  (MR metadata, diffs, discussions)          │
├─────────────────────────────────────────────┤
│        Review Context Builder               │
│  (Bounded packet, normalization)            │
├─────────────────────────────────────────────┤
│         Model Adapter Layer                 │
│  (OpenAI-compatible, structured prompt)     │
├─────────────────────────────────────────────┤
│          Decision Engine                    │
│  (skip/reply/new/suggestion)                │
├─────────────────────────────────────────────┤
│           Publisher Layer                   │
│  (GitLab discussions, suggestions, replies) │
├─────────────────────────────────────────────┤
│        Audit / Logging Layer                │
│  (Pino, correlation IDs, redaction)         │
└─────────────────────────────────────────────┘
```

## Module Structure

```
src/
��── main.ts              # Bootstrap, Fastify adapter, Swagger, global pipes
├── app.module.ts        # Root module
├── common/              # Shared interceptors, filters, utilities, types
��── auth/                # Client config loading, auth guard, HMAC
├── rate-limit/          # In-memory rate limiter, idempotency cache
├── health/              # /healthz and /readyz endpoints
├── gitlab/              # GitLab REST API adapter
├── review/              # Review controller, service, context builder, DTOs
├─�� model/               # Model adapter (OpenAI-compatible), prompts
└── publish/             # Decision engine, publisher
```

## Request Flow

1. HTTP request arrives at Fastify
2. `RequestIdInterceptor` assigns a UUID
3. `ValidationPipe` validates DTO
4. `AuthGuard` checks API key, client ID, endpoint allowlist, optional HMAC
5. Rate limit checked per client + target MR
6. Idempotency key checked (if present)
7. `ContextBuilderService` fetches MR data from GitLab
8. `ModelService` calls the model with structured prompt
9. `DecisionEngineService` compares findings vs existing discussions
10. `PublisherService` publishes decisions to GitLab (or skips in dry-run)
11. Structured JSON response returned

## Key Design Decisions

- **Model is advisory**: The service makes all publication decisions
- **Bounded context**: Only changed file diffs sent to model, not full repo
- **Deduplication first**: Existing discussions checked before publishing
- **No database**: All state is in-memory, resets on restart
- **Deterministic publishing**: GitLab API calls are explicit, never delegated to model
