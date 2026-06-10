# PostgreSQL quota storage

This guide explains how to move AI request counters from serverless instance memory to external PostgreSQL-compatible storage.

## Why this is needed

Serverless containers can run several instances. If counters are stored in memory, each instance has its own independent limits. A user can effectively get more requests when traffic is distributed across instances.

PostgreSQL mode stores counters in a shared database, so hourly and daily limits are enforced across all backend instances.

## Required environment variables

```text
AI_QUOTA_STORAGE=postgres
DATABASE_URL=postgresql://user:password@host:6432/dbname
DATABASE_SSL=true
```

`DATABASE_SSL=true` is the recommended default for managed cloud PostgreSQL.

## Table

The backend creates this table automatically on startup:

```sql
create table if not exists ai_quota_counters (
  user_id text not null,
  window_name text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, window_name)
);
```

## Recommended production setup

Use one of:

- Yandex Managed Service for PostgreSQL;
- Neon;
- Supabase;
- any PostgreSQL-compatible managed database.

For Yandex Cloud, store `DATABASE_URL` in Lockbox and pass it to the container as a secret environment variable.

## Deployment checklist

1. Create a PostgreSQL database.
2. Create a dedicated database user for the backend.
3. Get the connection string.
4. Store the connection string in a secret manager.
5. Redeploy backend with:

```text
AI_QUOTA_STORAGE=postgres
DATABASE_URL=<secret>
DATABASE_SSL=true
```

6. Check `/health`.
7. Make two requests over a small per-user limit and verify that the second request returns `RATE_LIMITED`.

## Fallback

If `AI_QUOTA_STORAGE=memory`, the product keeps working without PostgreSQL, but limits are not production-grade across multiple serverless instances.

