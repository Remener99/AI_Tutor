# Семпейс AI access control

Backend supports two access modes:

1. Legacy shared `API_TOKEN`.
2. Per-user access tokens through `AI_ACCESS_TOKENS`.

For pilot and production hardening, use per-user access tokens.

## Environment variables

### `API_TOKEN`

Legacy shared token. Keep it for backward compatibility while pilot packages are being migrated.

### `AI_ACCESS_TOKENS`

JSON array with allowed user tokens.

Example:

```json
[
  {
    "id": "pilot-user-001",
    "label": "Pilot student 001",
    "tokenHash": "sha256_hex_hash",
    "hourlyLimit": 30,
    "dailyLimit": 100,
    "revoked": false
  }
]
```

For local testing only, `token` can be used instead of `tokenHash`; the backend hashes it at startup. For deployed environments, prefer `tokenHash`.

### `AI_REVOKED_TOKEN_HASHES`

Comma-separated SHA-256 token hashes that must be permanently revoked.

Example:

```text
AI_REVOKED_TOKEN_HASHES=hash1,hash2,hash3
```

### `ADMIN_API_TOKEN`

Admin token for runtime access management endpoints.

## Request headers

Extension/backend requests can use any of these:

- `x-ai-tutor-user-token: <per-user-token>`
- `Authorization: Bearer <per-user-token>`
- `x-ai-tutor-api-token: <legacy-shared-token>`

## Per-user limits

When a token record has `hourlyLimit` or `dailyLimit`, those values override global `AI_HOURLY_LIMIT` and `AI_DAILY_LIMIT`.

Counters can use either local memory or PostgreSQL-compatible external storage.

### In-memory mode

```text
AI_QUOTA_STORAGE=memory
```

Use this only for local development. In serverless production, each instance has its own memory and counters are not shared.

### PostgreSQL mode

```text
AI_QUOTA_STORAGE=postgres
DATABASE_URL=postgresql://user:password@host:6432/dbname
DATABASE_SSL=true
```

On startup, the backend creates the `ai_quota_counters` table if it does not exist.

The table stores:

- `user_id`
- `window_name`: `hour` or `day`
- `window_started_at`
- `request_count`
- `updated_at`

This makes limits shared across serverless instances.

## Audit log

Every `/api/*` request writes a structured log event:

- `event: "api_audit"`
- `userId`
- masked token hash
- method and URL
- response status
- duration
- IP and user-agent

Request payloads, PDF text and raw tokens are not logged.

## Runtime revoke

List access tokens:

```bash
curl -H "x-ai-tutor-admin-token: $ADMIN_API_TOKEN" \
  https://backend.example.com/admin/access/tokens
```

Revoke by user id:

```bash
curl -X POST \
  -H "content-type: application/json" \
  -H "x-ai-tutor-admin-token: $ADMIN_API_TOKEN" \
  -d "{\"userId\":\"pilot-user-001\",\"reason\":\"pilot ended\"}" \
  https://backend.example.com/admin/access/revoke
```

Runtime revoke works immediately for the current backend instance. For permanent revoke across deploys and serverless instances, add the token hash to `AI_REVOKED_TOKEN_HASHES` and redeploy.
