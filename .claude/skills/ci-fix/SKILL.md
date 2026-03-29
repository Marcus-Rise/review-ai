---
name: ci-fix
description: Fix a failing CI check — diagnose, fix, verify locally, commit and push
---

# /ci-fix

1. **Get CI status**: check the failing job via GitHub MCP tools or provided URL
2. **Read logs**: identify the exact error message and failing step
3. **Diagnose**: trace error to source file, classify (build/lint/test/docker)
4. **Fix**: make the minimal change to resolve the failure
5. **Verify locally**:
   - `pnpm lint` (if lint failure)
   - `pnpm format:check` (if format failure)
   - `pnpm tsc:check` (if build failure)
   - `pnpm test` (if test failure)
   - `pnpm build` (always)
   - `docker build -t ai-review-service:test .` (if docker failure)
6. **Commit**: descriptive message prefixed with `fix:`
7. **Push**: to the current branch
8. **Report**: summarize what failed, why, and what was fixed
