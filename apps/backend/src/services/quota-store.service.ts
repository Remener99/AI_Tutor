import type { FastifyBaseLogger } from "fastify"
import pg from "pg"
import { env } from "../config/env.js"

type QuotaWindow = "hour" | "day"

type QuotaCheck = {
  key: string
  hourlyLimit: number
  dailyLimit: number
  now?: number
}

export type QuotaExceeded = {
  exceeded: true
  window: QuotaWindow
  limit: number
}

export type QuotaAccepted = {
  exceeded: false
}

type QuotaResult = QuotaExceeded | QuotaAccepted

type LimitBucket = {
  hourlyStartedAt: number
  hourlyCount: number
  dailyStartedAt: number
  dailyCount: number
}

export interface QuotaStore {
  readonly kind: "memory" | "postgres"
  consume(input: QuotaCheck): Promise<QuotaResult>
  close(): Promise<void>
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

const toWindowStart = (now: number, windowMs: number) => Math.floor(now / windowMs) * windowMs

const buildExceeded = (window: QuotaWindow, limit: number): QuotaExceeded => ({ exceeded: true, window, limit })

class MemoryQuotaStore implements QuotaStore {
  readonly kind = "memory" as const
  private readonly buckets = new Map<string, LimitBucket>()

  async consume({ key, hourlyLimit, dailyLimit, now = Date.now() }: QuotaCheck): Promise<QuotaResult> {
    const bucket = this.buckets.get(key) ?? {
      hourlyStartedAt: now,
      hourlyCount: 0,
      dailyStartedAt: now,
      dailyCount: 0
    }

    if (now - bucket.hourlyStartedAt >= HOUR_MS) {
      bucket.hourlyStartedAt = now
      bucket.hourlyCount = 0
    }
    if (now - bucket.dailyStartedAt >= DAY_MS) {
      bucket.dailyStartedAt = now
      bucket.dailyCount = 0
    }

    if (hourlyLimit > 0 && bucket.hourlyCount >= hourlyLimit) return buildExceeded("hour", hourlyLimit)
    if (dailyLimit > 0 && bucket.dailyCount >= dailyLimit) return buildExceeded("day", dailyLimit)

    bucket.hourlyCount += 1
    bucket.dailyCount += 1
    this.buckets.set(key, bucket)
    return { exceeded: false }
  }

  async close() {}
}

class PostgresQuotaStore implements QuotaStore {
  readonly kind = "postgres" as const
  private readonly pool: pg.Pool

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 5_000,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined
    })
  }

  async init() {
    await this.pool.query(`
      create table if not exists ai_quota_counters (
        user_id text not null,
        window_name text not null,
        window_started_at timestamptz not null,
        request_count integer not null default 0,
        updated_at timestamptz not null default now(),
        primary key (user_id, window_name)
      )
    `)
  }

  private async consumeWindow(client: pg.PoolClient, key: string, window: QuotaWindow, limit: number, startedAt: Date) {
    if (limit === 0) return null

    const result = await client.query<{ request_count: number }>(
      `
        insert into ai_quota_counters (user_id, window_name, window_started_at, request_count, updated_at)
        values ($1, $2, $3, 0, now())
        on conflict (user_id, window_name) do update
          set request_count = case
              when ai_quota_counters.window_started_at < excluded.window_started_at then 0
              else ai_quota_counters.request_count
            end,
            window_started_at = greatest(ai_quota_counters.window_started_at, excluded.window_started_at),
            updated_at = now()
        returning request_count
      `,
      [key, window, startedAt]
    )

    const currentCount = Number(result.rows[0]?.request_count ?? 0)
    if (currentCount >= limit) return buildExceeded(window, limit)

    await client.query(
      `
        update ai_quota_counters
        set request_count = request_count + 1, updated_at = now()
        where user_id = $1 and window_name = $2
      `,
      [key, window]
    )
    return null
  }

  async consume({ key, hourlyLimit, dailyLimit, now = Date.now() }: QuotaCheck): Promise<QuotaResult> {
    const hourlyStartedAt = new Date(toWindowStart(now, HOUR_MS))
    const dailyStartedAt = new Date(toWindowStart(now, DAY_MS))
    const client = await this.pool.connect()

    try {
      await client.query("begin")
      const hourlyResult = await this.consumeWindow(client, key, "hour", hourlyLimit, hourlyStartedAt)
      if (hourlyResult) {
        await client.query("rollback")
        return hourlyResult
      }

      const dailyResult = await this.consumeWindow(client, key, "day", dailyLimit, dailyStartedAt)
      if (dailyResult) {
        await client.query("rollback")
        return dailyResult
      }

      await client.query("commit")
      return { exceeded: false }
    } catch (error) {
      await client.query("rollback").catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async close() {
    await this.pool.end()
  }
}

let quotaStore: QuotaStore | null = null

export const initQuotaStore = async (logger: FastifyBaseLogger) => {
  if (quotaStore) return quotaStore

  if (env.AI_QUOTA_STORAGE === "postgres") {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when AI_QUOTA_STORAGE=postgres")
    }
    const store = new PostgresQuotaStore(env.DATABASE_URL)
    await store.init()
    quotaStore = store
    logger.info({ event: "quota_store_ready", storage: store.kind }, "AI quota store initialized")
    return store
  }

  quotaStore = new MemoryQuotaStore()
  logger.info({ event: "quota_store_ready", storage: quotaStore.kind }, "AI quota store initialized")
  return quotaStore
}

export const getQuotaStore = () => {
  if (!quotaStore) throw new Error("AI quota store is not initialized")
  return quotaStore
}

