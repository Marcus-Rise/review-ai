# Review Rules

## Review Priorities (Default Profile)

1. **Correctness and regressions** — logic errors, wrong behavior
2. **Security and data exposure** — auth bypasses, injection, secrets leakage
3. **Missing or weakened tests** — removed assertions, untested paths
4. **Broken public contracts** — API changes, type changes, interface breaks
5. **Architecture contradictions** — violations of established patterns
6. **Narrowly scoped maintainability** — only when directly affecting regression risk

## What the Service Does NOT Review

- Stylistic preferences (formatting, naming conventions)
- Trivial whitespace or import ordering
- Code that hasn't changed in the MR
- Full repository analysis (only changed files)

## Deduplication Logic

Before publishing any finding, the service checks existing MR discussions:

1. **Fingerprint match** — same file + line + category + topic hash → **skip**
2. **Exact file + line + category match** on unresolved discussion → **skip**
3. **Nearby unresolved discussion** (within 3 lines, same file) → **reply**
4. **Resolved discussion** with matching fingerprint → **new discussion** (issue reappeared)
5. **No match** → **new discussion** or **new discussion with suggestion**

## Suggestion Rules

A suggestion block is created only when:
- The fix is local (affects only the target lines)
- The fix is small (max 20 lines)
- The finding is marked as `is_suggestion_safe` by the model
- The issue is NOT a critical security finding (those need human judgment)

## Model Interaction Rules

- Model receives only changed file diffs, not the full repository
- System prompt is fixed and cannot be overridden by user_focus
- Model must return structured JSON findings
- Invalid model output is safely discarded
- Model has no access to GitLab — it's read-only and advisory
