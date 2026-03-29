# AI Review Service — MVP Technical Specification

## 1. Purpose

Build a minimal but production-oriented **self-hosted AI code review service** for **GitLab Self-Managed Free Tier 18.19**.

The service must run on **Ubuntu in Docker, without GPU**, and the first release must be designed around a **manual GitLab CI job** as the entrypoint.

A developer manually starts a GitLab job, optionally provides review parameters, and that job triggers this service. The service then:

1. authenticates the incoming request,
2. fetches merge request review context from GitLab,
3. calls a self-hosted coding model,
4. decides what review output is appropriate,
5. and publishes review results back to GitLab.

Review output may include:

- inline discussions,
- inline discussions with suggestion blocks,
- replies to existing discussions,
- or no-op / skip decisions.

The implementation must be suitable for future extension with:

- GitLab webhooks,
- `@bot` mention-driven review replies,
- more review profiles,
- stronger secret management,
- and optional persistent infrastructure.

Those future items are **not required for MVP** unless explicitly listed below.

---

## 2. Product Goals

### 2.1. MVP goals

1. Provide a **manual GitLab CI job entrypoint** for AI review.
2. Accept a **small authenticated request** from GitLab job to the service.
3. Let the **service fetch review context from GitLab API itself**.
4. Let the **service call a self-hosted coding model endpoint**.
5. Let the **service decide whether to**:
   - create a new inline discussion,
   - create a new inline discussion with a suggestion,
   - reply to an existing discussion,
   - or skip output.
6. Avoid duplicate review noise by checking existing unresolved discussions before publishing.
7. Ship as a **Docker image** runnable on Ubuntu without GPU.
8. Provide **README, API docs, deployment instructions, secrets instructions, Docker / Compose examples, and a GitLab CI example job**.
9. Provide **GitHub Actions** to build, test, and publish the Docker image.
10. Provide **structured project documentation under a root `docs/` directory** so future work can continue without re-discovering project context.

### 2.2. Non-goals for MVP

1. No database.
2. No Redis.
3. No background queue.
4. No webhook-first architecture.
5. No admin UI.
6. No key issuance / key rotation API.
7. No persistent audit store.
8. No hot-reload of secrets.
9. No unrestricted repository-wide autonomous agent browsing.
10. No full multi-tenant SaaS behavior.

---

## 3. Product Philosophy

The system must follow these principles:

1. **Model is advisory, not authoritative.**
   - The model analyzes prepared context.
   - The model returns structured findings only.
   - The service decides what is safe and appropriate to publish.

2. **GitLab actions are deterministic.**
   - Publishing to GitLab must never be delegated directly to the model.
   - The service must use explicit GitLab API logic to create discussions and replies.

3. **Context must be bounded.**
   - The model must not receive the full repository by default.
   - The service must assemble a normalized and constrained review packet.

4. **Signal over noise.**
   - Prioritize correctness, regressions, security, missing tests, contract breaks, and real architectural contradictions.
   - Avoid shallow stylistic churn and low-value review spam.

5. **No duplicate spam.**
   - Existing unresolved discussions must be checked before posting.
   - If the topic already exists, prefer reply or skip over creating a new discussion.

6. **Minimal infrastructure.**
   - MVP must work without database, queue, Redis, or GPU.

7. **Project must remain understandable after a month-long pause.**
   - Architecture, contracts, business rules, and operating assumptions must be documented in-repo.

---

## 4. Target Technology Stack

The implementation must target a **Node.js / TypeScript stack**.

### 4.1. Runtime

- **Node.js 24 LTS**
- **TypeScript**

### 4.2. Application framework

- **NestJS** as the primary application framework
- Prefer a modular NestJS architecture with clear separation of layers

### 4.3. HTTP platform

- Prefer **NestJS + Fastify adapter** for low overhead and good operational characteristics
- Express is acceptable only if there is a strong implementation reason, but Fastify is preferred

### 4.4. Validation and DTOs

- NestJS DTO-based request validation
- Strongly typed request / response contracts
- Validation should be implemented via Nest-compatible mechanisms such as:
  - `class-validator`
  - `class-transformer`
  - and NestJS validation pipes

### 4.5. Authentication / authorization support

- Use NestJS guards / interceptors / pipes as primary framework tools
- For the MVP, custom auth guards for API key + HMAC are preferred over adding database-backed auth complexity
- `@nestjs/passport` may be used only if it clearly simplifies implementation without introducing unnecessary complexity

### 4.6. API docs

- **Swagger / OpenAPI** using `@nestjs/swagger`
- API versioning must be first-class
- Swagger should be:
  - enabled in development,
  - and either disabled or protected in production via config

### 4.7. Logging

- Use a Nest-compatible structured logger
- Preferred choice: **Pino** via a Nest integration such as `nestjs-pino`
- Must support at least:
  - `debug`
  - `info`
  - `warn`
  - `error`

### 4.8. Testing stack

- **Jest** for unit and integration tests
- **Supertest** or equivalent for HTTP e2e / smoke tests
- Test execution must be part of GitHub Actions

### 4.9. HTTP client

- Use a production-grade Node HTTP client such as:
  - native `fetch` if suitable,
  - or `undici`,
  - or another well-supported Nest-compatible client
- Keep GitLab and model integrations explicit and testable

---

## 5. Deployment Target

### 5.1. Runtime target

- Ubuntu server
- Docker-based deployment
- No GPU
- Private internal network preferred
- HTTPS termination may happen via reverse proxy outside the container

### 5.2. Packaging requirements

The project must produce:

1. a production Docker image,
2. a sample `docker-compose.yml`,
3. a README with setup instructions,
4. a GitHub Actions workflow that builds, tests, and publishes the image.

### 5.3. Container hardening requirements

The production container should:

1. run with a **non-root / unprivileged user**,
2. avoid unnecessary Linux capabilities,
3. support **read-only root filesystem** where practical,
4. expose health endpoints for orchestration and diagnostics,
5. handle graceful shutdown correctly.

---

## 6. GitLab Integration Model

### 6.1. GitLab version target

- GitLab Self-Managed Free Tier 18.19

### 6.2. MVP entrypoint

The first version must use a **manual GitLab CI job** as the trigger.

A developer manually runs the job and may optionally provide:

- review mode / scope,
- base SHA override,
- optional user review focus,
- dry-run mode,
- optional review profile.

### 6.3. High-level flow

1. Developer runs manual GitLab job.
2. GitLab job calls the AI review service.
3. The service authenticates the request.
4. The service uses GitLab API to fetch:
   - merge request metadata,
   - latest MR diff version,
   - changed files / patch slices,
   - existing discussions,
   - unresolved discussion threads,
   - and any other required review context.
5. The service builds a normalized review packet.
6. The service calls the model endpoint.
7. The service validates model output.
8. The service deduplicates findings against existing discussions.
9. The service publishes review output back to GitLab.
10. The service returns a structured response to the GitLab job.

### 6.4. Important GitLab assumptions

1. The service must operate in the context of a **specific merge request**.
2. The request from the job must include at minimum:
   - GitLab base URL,
   - project path or project ID,
   - MR IID,
   - optional base/head SHA overrides,
   - review mode,
   - dry-run flag,
   - optional user focus.
3. The service must not rely on “previous commit” as a universal default if MR-specific diff base information is available.
4. The service must use GitLab MR diff/version APIs to create proper inline discussions.
5. The service must support reading current unresolved discussions before posting any new review content.

---

## 7. Existing Design Patterns to Reuse Conceptually

The implementation should conceptually align with patterns already validated in prior local tooling:

- read current MR review context,
- read existing discussions,
- post discussion replies,
- post inline discussions,
- route review across specialized reviewer roles,
- treat review findings as structured outputs,
- distinguish accept / reply / contest / skip states,
- avoid duplicate postings.

Do **not** hard-bind the new service to the prior repository structure, but do preserve the same design principles:

- deterministic GitLab API adapters,
- review orchestration separate from model reasoning,
- specialist review profiles,
- safe reply behavior,
- deduplication before publish.

---

## 8. MVP Architecture

Use a layered architecture with clear boundaries.

### 8.1. Ingress / API layer
Responsibilities:
- receive authenticated HTTP requests,
- validate request schema,
- enforce rate limits,
- enforce body size limits,
- assign request IDs,
- reject malformed or unauthorized requests early.

### 8.2. Auth / client config layer
Responsibilities:
- authenticate inbound GitLab job requests,
- load client credentials from secret file,
- validate `client_id`, `api_key`, optional HMAC signature,
- enforce per-client endpoint allowlist,
- provide per-client rate-limit configuration.

### 8.3. GitLab adapter layer
Responsibilities:
- call GitLab REST API,
- fetch MR metadata,
- fetch latest MR diff version,
- fetch changed files / diffs,
- fetch discussions and notes,
- create inline discussions,
- create inline discussions with suggestion blocks,
- reply to existing discussions.

### 8.4. Review context builder
Responsibilities:
- reduce raw GitLab data into bounded review context,
- normalize changed file hunks,
- preserve line references and diff context,
- normalize existing discussions,
- build semantic fingerprints for dedup.

### 8.5. Model adapter layer
Responsibilities:
- call self-hosted model endpoint using a stable adapter,
- pass structured prompt sections,
- request structured JSON output,
- reject invalid model output.

### 8.6. Decision engine
Responsibilities:
- compare model findings against existing discussions,
- decide `skip`, `reply`, `new discussion`, `new discussion with suggestion`,
- enforce suggestion safety rules,
- enforce publication policy.

### 8.7. Publisher layer
Responsibilities:
- translate decisions into GitLab discussion API requests,
- build proper diff position payloads,
- publish replies and inline discussions,
- record result summary.

### 8.8. Audit / logging layer
Responsibilities:
- structured logs,
- no secret leakage,
- request correlation,
- summary of findings / actions / skips,
- clear failure diagnostics by layer.

---

## 9. Security and Authentication

### 9.1. Inbound auth: GitLab job -> AI review service

The service must authenticate incoming requests.

Required MVP mechanism:

- `Authorization: Bearer <api_key>`
- `X-Client-Id: <client_id>`

Preferred additional protection for MVP:

- `X-Request-Timestamp: <unix timestamp>`
- `X-Request-Signature: <HMAC_SHA256(body + timestamp, client_secret)>`

The service must:

1. authenticate the API key,
2. validate the client ID,
3. verify that the client is enabled,
4. verify that the endpoint is allowed for that client,
5. optionally validate HMAC signature,
6. reject expired timestamps,
7. reject malformed requests,
8. never log raw secrets.

### 9.2. Service -> GitLab auth

The service must use a GitLab token supplied by the caller or otherwise configured for the request context.

For MVP, support passing the GitLab token in a request header or payload field that is handled in-memory only and never logged.

The GitLab token may be one of:

- project access token,
- group access token,
- personal access token,

as long as it has sufficient API scope for reading MR data and publishing discussions.

The service must not assume one fixed global token for one fixed project.

### 9.3. Domain / origin checks

Do not rely on `Host`, `Origin`, or domain checks as the primary trust mechanism.

If desired, they may be an auxiliary check only.

Primary trust must come from:

- API key,
- client ID,
- optional HMAC,
- optional source IP allowlist,
- internal/private deployment.

---

## 10. Secrets and Configuration

### 10.1. No database

The MVP must not require a database.

### 10.2. Client auth config source

Client credentials must be loaded from a **secret-mounted JSON file**, not primarily from raw environment variables.

Recommended approach:

- mount a Docker / Compose secret file into the container,
- expose only the path to that file via env,
- load the file at service startup,
- keep it in memory during process lifetime.

Example env:

- `CLIENTS_CONFIG_PATH=/run/secrets/ai_review_clients`

### 10.3. Example secret structure

Use a JSON structure similar to:

```json
{
  "clients": [
    {
      "client_id": "gitlab-review-job",
      "api_key": "...",
      "client_secret": "...",
      "enabled": true,
      "allowed_endpoints": ["/api/v1/reviews/run"],
      "rate_limit": {
        "requests": 1,
        "per_seconds": 60
      }
    }
  ]
}
```

### 10.4. Config categories

Use three config categories:

#### Static service env config
Examples:
- `APP_ENV`
- `LOG_LEVEL`
- `PORT`
- `CLIENTS_CONFIG_PATH`
- `MODEL_ENDPOINT`
- `MODEL_NAME`
- `SWAGGER_ENABLED`
- request size/time limits

#### Secret-mounted file config
Examples:
- client auth config JSON

#### Per-request GitLab config
Examples:
- GitLab base URL
- project path / ID
- MR IID
- GitLab token
- review mode
- dry-run
- optional base/head override
- optional user focus

### 10.5. Rotation model

For MVP:
- no hot reload is required,
- rotation happens by replacing the secret file and restarting the container.

README must document this explicitly.

---

## 11. Rate Limiting and Abuse Protection

The service must include a built-in in-memory rate limiter.

### Required behavior

1. Support per-client rate limits.
2. Support per-target review limits.
3. Return a clear error on limit hit.
4. Avoid duplicate expensive reprocessing.

### Recommended default MVP strategy

Rate-limit key should combine:

- `client_id`,
- `gitlab.project_path` or project ID,
- `gitlab.mr_iid`,
- optionally review mode.

Recommended default:

- 1 request per 60 seconds for the same target MR and client.

Also support a small global process-level limit to protect the service.

### Idempotency

Add support for `Idempotency-Key` request header.

The service should use it to avoid duplicate review publication when the same request is retried.

Without DB, this can be implemented as an in-memory TTL cache for MVP.

---

## 12. API Design

Use versioned REST endpoints.

### Required endpoints

#### `POST /api/v1/reviews/run`
Primary MVP endpoint.

Takes a minimal request from GitLab job and performs a review.

#### `GET /api/v1/help`
Human-readable help / usage summary.

#### `GET /healthz`
Basic liveness check.

#### `GET /readyz`
Readiness check.

#### `/docs`
Auto-generated Swagger / OpenAPI docs.

Swagger must be enabled/disabled by configuration and may be protected in production.

### Optional endpoint for later

#### `POST /api/v1/webhooks/gitlab`
Do not fully implement webhook-driven behavior unless needed now, but keep architecture compatible with adding it later.

---

## 13. Request Contract for `POST /api/v1/reviews/run`

The endpoint should accept JSON with a structure similar to this:

```json
{
  "api_version": "v1",
  "gitlab": {
    "base_url": "https://gitlab.example.com",
    "project_path": "group/project",
    "mr_iid": 123,
    "token": "...",
    "base_sha": "optional",
    "head_sha": "optional"
  },
  "review": {
    "mode": "mr",
    "dry_run": false,
    "profile": "default",
    "user_focus": "Please pay extra attention to login redirect safety and query param regressions."
  }
}
```

### Contract rules

1. `api_version` is mandatory.
2. `gitlab.base_url` is mandatory.
3. One of `project_path` or project ID must be supported.
4. `mr_iid` is mandatory for MVP.
5. `token` is mandatory for MVP unless an alternative credential mode is explicitly added.
6. `mode` must be validated against allowed values.
7. `user_focus` is optional and advisory only.
8. Unknown fields should be rejected or ignored based on explicit schema policy.

---

## 14. Response Contract

The endpoint must return structured JSON with enough detail for CI logs and debugging.

Example shape:

```json
{
  "request_id": "...",
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
      "discussion_id": "optional if created",
      "reason": "security_regression"
    }
  ],
  "warnings": []
}
```

### On failures

Return structured error JSON with:

- request ID,
- error code,
- safe message,
- retryability hint if possible.

Do not expose secrets in errors.

---

## 15. Review Context Retrieval

The service must fetch its own GitLab context.

### Minimum context to fetch

1. MR metadata
2. Latest MR diff version refs
3. Changed files / patch slices
4. Existing discussions
5. Existing unresolved discussion notes
6. Relevant note metadata for replies

### Review packet rules

The service must build a bounded packet for the model containing:

- MR title / description if useful,
- changed file slices only,
- limited hunk context,
- relevant line references,
- normalized existing discussion summaries,
- optional review profile,
- optional user focus,
- publication rules and output schema.

The service must not dump the full repository into the model by default.

---

## 16. Model and Model Adapter Requirements

### 16.1. MVP model strategy

The service must support a **self-hosted coding model endpoint** via a pluggable adapter.

Required config:
- `MODEL_ENDPOINT`
- `MODEL_NAME`

The implementation must avoid assuming access to cloud-only hosted models.

### 16.2. Model call requirements

1. Use a structured system prompt.
2. Keep the model read-only and advisory.
3. Request strict JSON output.
4. Fail safely on invalid JSON.
5. Keep prompts compact and bounded.

### 16.3. Review focus priorities

The default review priorities should be:

1. correctness and regressions,
2. security and data exposure,
3. missing or weakened tests,
4. broken public contracts,
5. architecture contradictions,
6. narrowly scoped maintainability issues that directly affect regression risk.

### 16.4. Output requirements from the model

The model should return a flat list of structured findings. Each finding should include where possible:

- category,
- severity,
- confidence,
- file path,
- line or range,
- concise risk statement,
- concise rationale,
- optional local replacement / suggestion candidate,
- whether it is suitable for inline comment,
- whether it is suitable for suggestion block.

---

## 17. User Focus / Prompt Injection Handling

The manual GitLab job must support an optional free-text input from the developer, for example:

- “pay extra attention to auth redirect safety”
- “focus on test gaps in changed DTOs”

This input must be treated as **advisory only**.

### Rules

1. It must never override system instructions.
2. It must never override security policy.
3. It must never override output schema.
4. It must never override dedup / publication logic.
5. It must never be allowed to instruct the model or service to ignore previous rules.

### Required safeguards

1. Length limit.
2. Sanitization / normalization.
3. Optional validation against prompt-injection patterns.
4. Structured insertion into the prompt as `user_focus`, never merged into core system rules.

If unsafe, the service may discard or neutralize the field and continue.

---

## 18. Deduplication and Discussion Continuation

This is a core product requirement.

Before publishing, the service must inspect existing discussions and unresolved threads.

### Required behavior

For each new candidate finding, the service must decide whether to:

1. **skip** because a matching unresolved discussion already exists,
2. **reply** to an existing discussion because the topic matches,
3. **create a new discussion** because the issue is new,
4. **create a new discussion with suggestion** because the issue is local and safely patchable.

### Suggested fingerprint dimensions

Use a combination of:
- file path,
- line or nearby changed range,
- category,
- semantic topic / issue type,
- symbol or function name if available.

### Reply behavior

If the same issue was already raised and remains relevant, the service should prefer replying to the existing thread instead of opening a new one.

### Resolved threads

If a thread is resolved but the same issue genuinely reappears in a new change, a new discussion may be created.

---

## 19. Suggestion Publishing Rules

A suggestion block should be created only when the fix is:

1. local,
2. small,
3. safe,
4. clearly represented as a patch on the relevant lines.

If the issue is broader, architectural, ambiguous, or spans more context than is safe for a suggestion block, the service must create a normal inline discussion instead.

The publisher must build valid GitLab discussion payloads using the latest MR diff version refs and line positions.

---

## 20. Logging Requirements

Logging must be treated as a first-class concern.

### 20.1. Logger behavior

Use a structured logger with clear severity levels:

- `debug`
- `info`
- `warn`
- `error`

### 20.2. Layer-aware logging

Logs should clearly distinguish where a failure happened, for example:

- auth / client validation
- DTO validation / request schema
- rate limiting
- GitLab API fetch
- model call / model output validation
- decision engine
- GitLab publishing
- health / readiness status

### 20.3. Logging rules

1. Never log secrets.
2. Never log raw tokens.
3. Include request correlation IDs.
4. Keep logs useful for production troubleshooting.
5. Make debug logging configurable by environment.

---

## 21. Health Checks and Operability

The service must expose health-related endpoints.

### Required endpoints

- `GET /healthz` — liveness check
- `GET /readyz` — readiness check

### Expectations

1. `healthz` should answer whether the process is alive.
2. `readyz` should answer whether the service is ready to handle requests.
3. Readiness may include checks such as:
   - required configuration loaded,
   - secrets parsed successfully,
   - model endpoint config present,
   - service initialization completed.
4. Do not turn readiness into a slow deep-diagnostics endpoint.
5. Health endpoints should be suitable for Docker / Compose / reverse-proxy health checks.

---

## 22. GitLab Manual Job Requirements

Provide an example GitLab CI manual job.

### The job must

1. be manually runnable,
2. not be tied to build/deploy pipeline success,
3. support optional developer inputs,
4. call the service endpoint,
5. print a concise summary to CI logs,
6. support dry-run mode.

### Optional inputs

If supported by the target runner / GitLab setup, use typed job inputs. Otherwise use manual variables.

Suggested inputs:

- `REVIEW_MODE`
- `REVIEW_BASE_SHA`
- `REVIEW_DRY_RUN`
- `REVIEW_PROFILE`
- `REVIEW_USER_FOCUS`

### Secrets rules

The example job must clearly document that secrets are not entered manually in the job UI.

Secrets must come from CI/CD secret variables or external secret management.

---

## 23. Documentation Requirements

The repository must include high-quality project documentation under a root `docs/` directory.

This documentation is not decorative. It must help both humans and coding agents continue work later without re-analyzing the project from scratch.

### Required docs

#### `README.md`
Must include:
- project purpose,
- architecture summary,
- prerequisites,
- local run instructions,
- Docker run instructions,
- Docker Compose instructions,
- secrets setup instructions,
- configuration reference,
- example GitLab CI job,
- API usage examples,
- security notes,
- limitations of the no-DB MVP,
- future extension notes.

#### `docs/` directory
Must include clearly structured Markdown docs such as:

- `docs/architecture.md`
- `docs/api-contracts.md`
- `docs/security.md`
- `docs/review-rules.md`
- `docs/testing.md`
- `docs/operability.md`
- `docs/adr/` for architectural decisions if helpful

### Documentation quality requirements

Docs must be:

1. practical,
2. dry and precise rather than marketing-style,
3. suitable for future self-review by coding agents,
4. sufficient for returning to the project after a long pause.

---

## 24. Docker and Compose Requirements

Provide:

1. Dockerfile
2. production-friendly image
3. sample Compose file
4. secret-mounted config example
5. clear README instructions for Ubuntu deployment

The container should preferably:

- run as non-root,
- expose health endpoints,
- support graceful shutdown,
- support read-only filesystem where practical,
- avoid unnecessary privileges.

---

## 25. Testing Requirements

The project must include automated tests.

### 25.1. Test stack

- **Jest** for unit and integration tests
- **e2e / smoke tests** using Nest-friendly tooling such as Supertest

### 25.2. Required test categories

1. request schema validation tests,
2. auth tests,
3. rate-limit tests,
4. secret config loading tests,
5. prompt sanitization tests,
6. GitLab adapter unit tests,
7. deduplication decision tests,
8. publisher decision tests,
9. model output validation tests,
10. dry-run behavior tests,
11. health endpoint tests,
12. critical path smoke tests.

Integration-style tests with mocked GitLab API and mocked model endpoint are strongly preferred.

### 25.3. CI requirements

GitHub Actions must run tests on each relevant change so the project keeps a stable baseline through iterative development.

---

## 26. GitHub Actions Requirements

Provide GitHub Actions workflows to:

1. install dependencies,
2. run lint / format checks if configured,
3. run unit tests,
4. run integration / e2e / smoke tests as appropriate,
5. build Docker image,
6. optionally publish image to a container registry,
7. optionally tag releases.

At minimum, the repository must be buildable and testable in GitHub Actions from scratch.

---

## 27. No Database Constraints

Because the MVP must not use a database:

1. client auth config lives in a secret file,
2. rate limits are in-memory,
3. idempotency cache is in-memory with TTL,
4. no persistent job history is required,
5. no persistent audit database is required.

The README must clearly document the consequences:

- state resets on restart,
- in-memory rate limits reset on restart,
- idempotency memory resets on restart,
- secret rotation requires restart.

---

## 28. MVP Acceptance Criteria

The MVP is acceptable only if all of the following are true:

1. It runs in Docker on Ubuntu without GPU.
2. It targets Node.js 24 LTS and TypeScript.
3. It uses NestJS as the main application framework.
4. It does not require a database.
5. It authenticates inbound requests.
6. It supports client config from a secret-mounted JSON file.
7. It supports rate limiting.
8. It supports an optional developer advisory focus field.
9. It protects system rules from prompt override.
10. It fetches MR context from GitLab API itself.
11. It checks existing discussions before publishing.
12. It can reply to an existing discussion when appropriate.
13. It can create inline GitLab discussions.
14. It can create inline discussions with suggestion blocks when safe.
15. It supports dry-run mode.
16. It returns structured JSON responses.
17. It provides Swagger / OpenAPI docs.
18. It provides health and readiness endpoints.
19. It runs in a non-root container.
20. It ships with README, `docs/`, Compose example, and GitLab CI example.
21. It ships with GitHub Actions for build and test.
22. It includes Jest-based tests and critical smoke coverage.

---

## 29. Recommended Repository Structure

A suggested structure:

```text
.
├── docs/
│   ├── architecture.md
│   ├── api-contracts.md
│   ├── security.md
│   ├── review-rules.md
│   ├── testing.md
│   ├── operability.md
│   └── adr/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/
│   ├── config/
│   ├── auth/
│   ├── gitlab/
│   ├── review/
│   ├── model/
│   ├── publish/
│   ├── rate-limit/
│   └── health/
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .github/workflows/
├── Dockerfile
├── docker-compose.yml
├── README.md
├── .env.example
└── .gitlab-ci.yml.example
```

The exact structure may vary, but separation of concerns must remain clear.

---

## 30. Delivery Expectations for Claude

Claude should implement the project as a working repository, not just a design document.

### Deliverables

1. production-ready source code,
2. Dockerfile,
3. Compose example,
4. README,
5. `docs/` documentation set,
6. OpenAPI-enabled API,
7. test suite,
8. GitHub Actions workflows,
9. GitLab CI example job,
10. configuration examples,
11. clear comments where security or GitLab-specific API behavior matters.

### Expected implementation style

- keep code modular,
- avoid unnecessary abstractions,
- prioritize deterministic behavior,
- validate all external input,
- keep model interaction strongly bounded,
- keep GitLab integration explicit and testable,
- document business rules and operational assumptions in Markdown.

---

## 31. Future-Compatible Hooks (Design Only)

Do not fully implement these unless trivial, but keep the architecture ready for them:

1. GitLab webhook entrypoint
2. `@bot` mention handling inside MR notes/discussions
3. additional review profiles
4. credential references instead of raw per-request GitLab token
5. persistent idempotency / rate-limit store
6. secret reload without restart
7. queue-based execution

These are future design directions, not MVP requirements.

---

## 32. Final Instruction to Claude

Build the MVP exactly as a **minimal, secure, no-database, self-hosted AI review service** for **GitLab manual-job-triggered MR review**.

Optimize for:

- correctness,
- low operational complexity,
- bounded model usage,
- clear GitLab integration,
- safe publication behavior,
- strong documentation,
- health visibility,
- and a realistic path to future webhook / mention support.

If implementation trade-offs are necessary, prefer:

1. deterministic service behavior over model autonomy,
2. security over convenience,
3. explicit GitLab adapter logic over hidden magic,
4. simple restart-based secret rotation over premature infrastructure,
5. clear documentation over clever shortcuts.
