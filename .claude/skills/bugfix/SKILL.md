---
name: bugfix
description: Systematic bug investigation and fix for NestJS services
---

# /bugfix

1. Reproduce: find the error text, stack trace, or failing test
2. Locate root cause in the code (grep logs, trace data flow)
3. Write a unit test that reproduces the defect
4. Make the minimal fix
5. Verify: `pnpm test` is green
6. Run `pnpm lint` and `npx tsc --noEmit` on changed files
7. Summarize: what was broken, why, what was fixed, what was verified