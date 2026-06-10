# Sempayce AI monitoring

## Backend endpoints

### Public health

```text
GET /health
```

Cheap uptime check. It does not require auth and does not call the AI provider.

### Admin status

```text
GET /admin/monitoring/status
Header: x-ai-tutor-admin-token: <ADMIN_API_TOKEN>
```

Checks:

- backend process availability;
- quota storage availability;
- quota storage latency;
- per-instance HTTP counters for `2xx`, `3xx`, `4xx`, `5xx`;
- per-route count, average latency, max latency, `401`, `429`, `5xx`.

### Admin AI config check

```text
GET /admin/monitoring/ai-check
Header: x-ai-tutor-admin-token: <ADMIN_API_TOKEN>
```

This endpoint verifies that the active AI provider is configured and returns provider/model metadata. It is intentionally crash-safe and does not spend AITUNNEL budget.

For a real external provider ping, use a separate monitor job with a low frequency, for example once every 6 hours, so provider instability cannot crash the backend.

## Error Dashboard

The backend emits structured audit logs for `/api/*` requests:

```json
{
  "event": "api_audit",
  "userId": "pilot-current",
  "tokenHash": "masked",
  "method": "POST",
  "url": "/api/plan/generate",
  "statusCode": 200,
  "durationMs": 120,
  "ip": "127.0.0.1",
  "userAgent": "..."
}
```

Recommended dashboard charts:

- `401` count: missing, invalid, or revoked token;
- `429` count: rate limit pressure;
- `5xx` count: backend/provider errors;
- average and p95 `durationMs`;
- count grouped by route URL;
- quota storage latency from `/admin/monitoring/status`.

## Alert Rules

Recommended pilot thresholds:

- uptime: `/health` fails 2 checks in a row;
- latency: `/health` latency above 2000 ms;
- storage: `quotaStore.ok = false` or quota latency above 500 ms;
- AI config: `/admin/monitoring/ai-check` returns `ok: false`;
- auth spike: `401` grows sharply;
- limits spike: `429` grows sharply;
- backend errors: any sustained `5xx` growth.

## Budget Alerts

### Yandex Cloud

Create billing budget alerts in Yandex Cloud Billing:

- 50%;
- 80%;
- 100%;
- notification email or Telegram integration.

### AITUNNEL

Use AITUNNEL account limits if available. If AITUNNEL does not provide budget webhooks, keep a manual balance reminder and run real external AI ping checks rarely.
