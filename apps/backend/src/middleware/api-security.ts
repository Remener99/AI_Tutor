import type { FastifyInstance, FastifyRequest } from "fastify"
import { env } from "../config/env.js"
import { ApiError } from "../utils/errors.js"

type LimitBucket = {
  hourlyStartedAt: number
  hourlyCount: number
  dailyStartedAt: number
  dailyCount: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const buckets = new Map<string, LimitBucket>()

const getHeader = (request: FastifyRequest, name: string) => {
  const value = request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

const isApiRequest = (request: FastifyRequest) => request.url.startsWith("/api/")

const getClientKey = (request: FastifyRequest) =>
  getHeader(request, "x-ai-tutor-api-token") || request.ip || "unknown"

const resetIfExpired = (bucket: LimitBucket, now: number) => {
  if (now - bucket.hourlyStartedAt >= HOUR_MS) {
    bucket.hourlyStartedAt = now
    bucket.hourlyCount = 0
  }
  if (now - bucket.dailyStartedAt >= DAY_MS) {
    bucket.dailyStartedAt = now
    bucket.dailyCount = 0
  }
}

const assertApiToken = (request: FastifyRequest) => {
  if (!env.API_TOKEN || !isApiRequest(request)) return
  const token = getHeader(request, "x-ai-tutor-api-token")
  if (token !== env.API_TOKEN) {
    throw new ApiError("UNAUTHORIZED", "Неверный или отсутствующий API-token AI-тьютора.", 401)
  }
}

const assertAiQuota = (request: FastifyRequest) => {
  if (!isApiRequest(request)) return
  if (env.AI_HOURLY_LIMIT === 0 && env.AI_DAILY_LIMIT === 0) return

  const now = Date.now()
  const key = getClientKey(request)
  const bucket = buckets.get(key) ?? {
    hourlyStartedAt: now,
    hourlyCount: 0,
    dailyStartedAt: now,
    dailyCount: 0
  }
  resetIfExpired(bucket, now)

  if (env.AI_HOURLY_LIMIT > 0 && bucket.hourlyCount >= env.AI_HOURLY_LIMIT) {
    throw new ApiError("RATE_LIMITED", "Достигнут часовой лимит AI-запросов. Попробуйте позже.", 429, {
      limit: env.AI_HOURLY_LIMIT,
      window: "hour"
    })
  }
  if (env.AI_DAILY_LIMIT > 0 && bucket.dailyCount >= env.AI_DAILY_LIMIT) {
    throw new ApiError("RATE_LIMITED", "Достигнут дневной лимит AI-запросов. Попробуйте завтра.", 429, {
      limit: env.AI_DAILY_LIMIT,
      window: "day"
    })
  }

  bucket.hourlyCount += 1
  bucket.dailyCount += 1
  buckets.set(key, bucket)
}

export const registerApiSecurity = (app: FastifyInstance) => {
  app.addHook("onRequest", async (request) => {
    assertApiToken(request)
    assertAiQuota(request)
  })
}
