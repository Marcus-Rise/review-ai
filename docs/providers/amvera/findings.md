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

**Decision:** use `response_format: { type: "json_object" }` for non-reasoning models only (see below).

---

### `response_format` incompatible with reasoning models (gpt-5)

**Empirical test** — sending `response_format: { type: "json_object" }` together with `reasoning_effort` for `gpt-5` causes HTTP 400: `Invalid JSON object in request body`.

**Cause:** Amvera proxy (or underlying OpenAI API) does not support `response_format` with reasoning models. This is consistent with OpenAI's o-series behavior.

**Decision:** skip `response_format` for models with `reasoning: true`. The system prompt already mandates JSON output, so the field is redundant.

---

### `gpt-5` timeout without `reasoning_effort`

**Swagger spec** — `reasoning_effort` is an optional parameter, no required flag for specific models.

**Empirical test** — `gpt-5` without `reasoning_effort` consistently times out with Amvera's 60s Kong gateway timeout. With `reasoning_effort: "low"` — response time drops from 60s+ to ~19s.

**Cause:** `gpt-5` is a reasoning model (GPT-5 uses internal chain-of-thought). Without a cap, it exceeds the gateway timeout on real-size code review prompts.

**Decision:** models with `reasoning: true` in config get `reasoning_effort` instead of `temperature`. Configurable via `MODEL_REASONING_EFFORT` env var (default `low`; set `none` to omit the parameter).

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

### UTF-8 byte count vs character count

**Problem:** `string.length` в JavaScript считает UTF-16 code units (символы), а Kong проверяет размер тела в UTF-8 байтах. Для кириллицы 1 символ = 2 байта UTF-8. Diff из 12 000 символов с кириллицей может превысить ~17KB лимит Kong.

**Example:** 12 000 символов diff + ~1 500 символов промпта = 13 500 символов. Если 4 000+ символов — кириллица, UTF-8 размер: 13 500 + 4 000 = 17 500 байт → 400 от Kong.

**Decision:** добавлен `maxTotalDiffBytes: 13_000` в лимиты Amvera. `ContextBuilderService` считает UTF-8 байты через `Buffer.byteLength()` параллельно с символами. Лог AmveraProvider выводит оба значения: `body=13474ch/17200b`.

---

## Current behavior (as implemented)

| Parameter | gpt-5 | gpt-4.1 | deepseek/qwen |
|-----------|-------|---------|---------------|
| `temperature` | ✗ | ✓ | ✓ |
| `reasoning_effort` | ✓ (configurable) | ✗ | ✗ |
| `response_format` | ✗ (incompatible) | when `jsonMode=true` | when `jsonMode=true` |
| messages field | `text` (per spec) | `text` (per spec) | `text` (per spec) |

## Response parsing

```
choices[0].message.text     ← Swagger canonical
  ?? choices[0].message.content  ← empirical variant
  ?? ''
```
