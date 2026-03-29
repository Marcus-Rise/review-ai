---
name: pr-ready
description: Pre-PR validation checklist — self-review, lint, tsc, tests, MR description draft.
---

# /pr-ready

Final validation before MR handoff.

## Steps

1. `git status` — check for unintended files (secrets, .env, dist/)
2. **Self-review** — inspect own diff:
   - `git diff master...HEAD` for committed changes
   - `git diff` for uncommitted changes
   - Risk slices: `src/auth/`, token handling, clients-config, model prompts
   - Style: Logger usage, no `process.env` direct, no `any`, DTOs validated
3. `pnpm lint` — ESLint
4. `npx tsc --noEmit` — type-check
5. `pnpm test` — unit tests
6. `git log --oneline -5` — verify commit messages

## Output

- Change summary (what + why)
- Validation results (pass/fail per step)
- Remaining risks or follow-up tasks
- Suggested MR title and description