---
name: test-review
description: End-to-end test of the review-ai Docker container via curl — rebuild if needed, send a real MR review request, check logs on failure
---

# /test-review

Run a full end-to-end smoke test against the running Docker container.

## Steps

1. **Rebuild container** (if code was changed since last build):
   ```bash
   docker compose up -d --build ai-review-service 2>&1 | tail -5
   sleep 3
   ```
   Skip rebuild if only checking an already-running container.

2. **Send test request** (dry_run=true, use real MR or the default MR 1032):
   ```bash
   time curl -s -X POST "http://localhost:3000/api/v1/reviews/run" \
     -H "Authorization: Bearer my-test-key-123" \
     -H "X-Client-Id: gitlab-review-job" \
     -H "Content-Type: application/json" \
     -d '{
       "api_version": "v1",
       "gitlab": {
         "base_url": "https://gitlab.ssau.ru",
         "project_path": "lk/lk-next",
         "mr_iid": 1032,
         "token": "nvv2J2Mp7fvXeOATBBPbZm86MQp1OjM1CA.01.0y1358xay"
       },
       "review": {
         "mode": "mr",
         "dry_run": true,
         "profile": "default"
       }
     }' | python3 -m json.tool
   ```

3. **Check result**:
   - `status: "ok"` + `findings_considered >= 0` → PASS
   - `status: "error"` → check logs (step 4)

4. **On failure — read container logs**:
   ```bash
   docker logs ai-review-service --tail 30 2>&1 | grep -v healthz
   ```
   Common errors:
   - `model 'X' not found` → wrong MODEL_NAME in docker-compose.yml
   - `Invalid JSON object in request body` → body >17KB (Amvera Kong limit), reduce diff limits
   - `504 Gateway Timeout` → gpt-5 reasoning exceeded 60s, check reasoning_effort:low is set
   - `400 json_mode` → old code, response_format should be used instead
   - `CLIENTS_CONFIG_PATH not set` → secrets not mounted in docker-compose.yml

5. **Report**: print status, response time, findings_considered, warnings count.