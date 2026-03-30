# Amvera Adapter — Empirical Findings

> Date: 2026-03-30
> Status: implemented
> Related spec: `docs/model-strategy-spec.md`

## Context

`AmveraProvider` was implemented based on `docs.amvera.ru` documentation and the Swagger spec at `lllm-swagger-amvera-services.amvera.io`. During live testing, several discrepancies between spec and actual API behavior were found.

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

**Decision:** `gpt-5` placed in `REASONING_MODELS` set — gets `reasoning_effort: "low"` instead of `temperature`. `gpt-4.1` is NOT a reasoning model and gets `temperature` normally.

---

## Current behavior (as implemented)

| Parameter | gpt-5 | gpt-4.1 | deepseek/qwen/llama |
|-----------|-------|---------|---------------------|
| `temperature` | ✗ | ✓ | ✓ |
| `reasoning_effort: "low"` | ✓ | ✗ | ✗ |
| `response_format` | when `jsonMode=true` | when `jsonMode=true` | when `jsonMode=true` |
| messages field | `text` | `text` | `text` |

## Response parsing fallback chain

```
choices[0].message.text         ← GPT-format (Swagger canonical)
  ?? choices[0].message.content ← GPT-format (empirical variant)
  ?? alternatives[0].message.text          ← LLaMA-format (deprecated endpoint)
  ?? result.alternatives[0].message.text   ← LLaMA-format (legacy wrapper)
  ?? ''
```

Usage parsing normalizes both numeric (GPT) and string (LLaMA) values.
