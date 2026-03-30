# Amvera Adapter — Empirical Findings

> Date: 2026-03-30
> Status: implemented
> Related spec: `docs/model-strategy-spec.md`

## Context

`AmveraProvider` was implemented based on `docs.amvera.ru` documentation and the Swagger spec at `lllm-swagger-amvera-services.amvera.io` (saved as `docs/providers/amvera/openapi.json`). During live testing, several discrepancies between spec and actual API behavior were found.

---

## Model support

Config-driven approach — each model is one entry in `MODELS` map:

```typescript
const MODELS: Record<string, AmveraModelConfig> = {
  'gpt-4.1':      { endpoint: '/models/gpt' },
  'gpt-5':        { endpoint: '/models/gpt', reasoning: true },
  'deepseek-R1':  { endpoint: '/models/deepseek' },
  'deepseek-V3':  { endpoint: '/models/deepseek' },
  'qwen3_30b':    { endpoint: '/models/qwen' },
  'qwen3_235b':   { endpoint: '/models/qwen' },
};
```

LLaMA (`/models/llama`) — **removed**, deprecated by Amvera.

---

## Swagger vs Reality

### Messages format: `text` vs `content`

**Swagger spec** says messages use `text` field:
```json
{ "role": "system", "text": "..." }
```

**Empirical test** — API also accepts `content` (OpenAI-compatible field). Both work.

**Decision:** use `text` per spec (canonical format), add `content` fallback in response parsing only.

---

### Response format: `message.text` vs `message.content`

**Swagger spec** says `choices[].message.text`.

**Empirical test** — API returned `message.content` (not `message.text`) for `gpt-5`.

**Decision:** parse `message.text ?? message.content` — handles both variants.

---

### `json_mode` vs `response_format`

**Swagger spec** shows `response_format: { type: "json_object" }`.

**Empirical test** — sending `json_mode: true` causes HTTP 400: `Unknown parameter: 'json_mode'`.

**Decision:** use `response_format: { type: "json_object" }`.

---

### `gpt-5` timeout without `reasoning_effort`

**Swagger spec** — `reasoning_effort` is an optional parameter, no required flag for specific models.

**Empirical test** — `gpt-5` without `reasoning_effort` consistently times out with Amvera's 60s Kong gateway timeout. With `reasoning_effort: "low"` — response time drops from 60s+ to ~19s.

**Cause:** `gpt-5` is a reasoning model (GPT-5 uses internal chain-of-thought). Without a cap, it exceeds the gateway timeout on real-size code review prompts.

**Decision:** models with `reasoning: true` in config get `reasoning_effort: "low"` instead of `temperature`.

---

### Kong gateway body size limit: ~17KB

**Swagger spec** — не задокументировано.

**Empirical test** — бинарный поиск: тела >17KB возвращают `400 Invalid JSON object in request body` от Kong proxy. Лимит находится между 16875 и 17187 байт.

**Impact:** MR с большим diff (34+ файлов) падали с 400 даже при валидном JSON.

**Decision:** provider-specific limits in `ContextBuilderService` (applied only when `MODEL_PROVIDER=amvera`):
- `maxFiles`: 20 (vs 50 for openai)
- `maxDiffCharsPerFile`: 4,000 (vs 10,000 for openai)
- `maxTotalDiffChars`: 12,000 (vs 100,000 for openai)

Local models (Ollama) and direct OpenAI API are not affected by these restrictions.

---

## Current behavior (as implemented)

| Parameter | gpt-5 | gpt-4.1 | deepseek/qwen |
|-----------|-------|---------|---------------|
| `temperature` | ✗ | ✓ | ✓ |
| `reasoning_effort: "low"` | ✓ | ✗ | ✗ |
| `response_format` | when `jsonMode=true` | when `jsonMode=true` | when `jsonMode=true` |
| messages field | `text` | `text` | `text` |

## Response parsing

```
choices[0].message.text     ← Swagger canonical
  ?? choices[0].message.content  ← empirical variant
  ?? ''
```
