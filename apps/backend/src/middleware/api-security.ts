import type { FastifyInstance, FastifyRequest } from "fastify"
import { env } from "../config/env.js"
import { findAccessToken, hashAccessToken, isTokenHashRevoked, maskHash } from "../services/access-control.service.js"
import { ApiError } from "../utils/errors.js"

type LimitBucket = {
  hourlyStartedAt: number
  hourlyCount: number
  dailyStartedAt: number
  dailyCount: number
}

type SecurityContext = {
  userId: string
  tokenHash: string
  tokenLabel?: string
  hourlyLimit: number
  dailyLimit: number
}

declare module "fastify" {
  interface FastifyRequest {
    securityContext?: SecurityContext
    securityStartedAt?: number
  }
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const buckets = new Map<string, LimitBucket>()

const getHeader = (request: FastifyRequest, name: string) => {
  const value = request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

const isApiRequest = (request: FastifyRequest) => request.url.startsWith("/api/")

const getBearerToken = (request: FastifyRequest) => {
  const authorization = getHeader(request, "authorization")
  return authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
}

const getRequestToken = (request: FastifyRequest) =>
  getHeader(request, "x-ai-tutor-user-token") ||
  getBearerToken(request) ||
  getHeader(request, "x-ai-tutor-api-token")

const getClientKey = (request: FastifyRequest) =>
  request.securityContext?.userId || getHeader(request, "x-ai-tutor-api-token") || request.ip || "unknown"

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
  const rawToken = getRequestToken(request)
  if (typeof rawToken !== "string" || rawToken.length === 0) {
    throw new ApiError("UNAUTHORIZED", "Неверный, отсутствующий или отозванный токен AI-тьютора.", 401)
  }
  const requestToken: string = rawToken

  if (env.AI_ACCESS_TOKENS) {
    const { record, tokenHash } = findAccessToken(requestToken)
    if (!record) {
      throw new ApiError("UNAUTHORIZED", "Неверный, отсутствующий или отозванный токен AI-тьютора.", 401)
    }
    if (record.revoked || isTokenHashRevoked(record.tokenHash)) {
      throw new ApiError("UNAUTHORIZED", "Неверный, отсутствующий или отозванный токен AI-тьютора.", 401)
    }
    request.securityContext = {
      userId: record.id,
      tokenHash,
      tokenLabel: record.label,
      hourlyLimit: record.hourlyLimit ?? env.AI_HOURLY_LIMIT,
      dailyLimit: record.dailyLimit ?? env.AI_DAILY_LIMIT
    }
    return
  }

  if (requestToken !== env.API_TOKEN) {
    throw new ApiError("UNAUTHORIZED", "Неверный, отсутствующий или отозванный токен AI-тьютора.", 401)
  }
  request.securityContext = {
    userId: "legacy-api-token",
    tokenHash: hashAccessToken(requestToken),
    hourlyLimit: env.AI_HOURLY_LIMIT,
    dailyLimit: env.AI_DAILY_LIMIT
  }
}

const assertAiQuota = (request: FastifyRequest) => {
  if (!isApiRequest(request)) return
  const hourlyLimit = request.securityContext?.hourlyLimit ?? env.AI_HOURLY_LIMIT
  const dailyLimit = request.securityContext?.dailyLimit ?? env.AI_DAILY_LIMIT
  if (hourlyLimit === 0 && dailyLimit === 0) return

  const now = Date.now()
  const key = getClientKey(request)
  const bucket = buckets.get(key) ?? {
    hourlyStartedAt: now,
    hourlyCount: 0,
    dailyStartedAt: now,
    dailyCount: 0
  }
  resetIfExpired(bucket, now)

  if (hourlyLimit > 0 && bucket.hourlyCount >= hourlyLimit) {
    throw new ApiError("RATE_LIMITED", "Достигнут часовой лимит AI-запросов. Попробуйте позже.", 429, {
      limit: hourlyLimit,
      window: "hour"
    })
  }
  if (dailyLimit > 0 && bucket.dailyCount >= dailyLimit) {
    throw new ApiError("RATE_LIMITED", "Достигнут дневной лимит AI-запросов. Попробуйте завтра.", 429, {
      limit: dailyLimit,
      window: "day"
    })
  }

  bucket.hourlyCount += 1
  bucket.dailyCount += 1
  buckets.set(key, bucket)
}

export const registerApiSecurity = (app: FastifyInstance) => {
  app.addHook("onRequest", async (request) => {
    request.securityStartedAt = Date.now()
    assertApiToken(request)
    assertAiQuota(request)
  })

  app.addHook("onResponse", async (request, reply) => {
    if (!isApiRequest(request)) return
    app.log.info({
      event: "api_audit",
      userId: request.securityContext?.userId ?? "anonymous",
      tokenHash: request.securityContext?.tokenHash ? maskHash(request.securityContext.tokenHash) : undefined,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Date.now() - (request.securityStartedAt ?? Date.now()),
      ip: request.ip,
      userAgent: request.headers["user-agent"]
    })
  })
}
