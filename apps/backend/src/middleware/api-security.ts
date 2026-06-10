import type { FastifyInstance, FastifyRequest } from "fastify"
import { env } from "../config/env.js"
import { findAccessToken, hashAccessToken, isTokenHashRevoked, maskHash } from "../services/access-control.service.js"
import { getQuotaStore } from "../services/quota-store.service.js"
import { recordHttpMetric } from "../services/status-metrics.service.js"
import { ApiError } from "../utils/errors.js"

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

const unauthorized = () =>
  new ApiError("UNAUTHORIZED", "Неверный, отсутствующий или отозванный токен AI-тьютора.", 401)

const assertApiToken = (request: FastifyRequest) => {
  if (!env.API_TOKEN || !isApiRequest(request)) return
  const rawToken = getRequestToken(request)
  if (typeof rawToken !== "string" || rawToken.length === 0) throw unauthorized()
  const requestToken: string = rawToken

  if (env.AI_ACCESS_TOKENS) {
    const { record, tokenHash } = findAccessToken(requestToken)
    if (!record) throw unauthorized()
    if (record.revoked || isTokenHashRevoked(record.tokenHash)) throw unauthorized()
    request.securityContext = {
      userId: record.id,
      tokenHash,
      tokenLabel: record.label,
      hourlyLimit: record.hourlyLimit ?? env.AI_HOURLY_LIMIT,
      dailyLimit: record.dailyLimit ?? env.AI_DAILY_LIMIT
    }
    return
  }

  if (requestToken !== env.API_TOKEN) throw unauthorized()
  request.securityContext = {
    userId: "legacy-api-token",
    tokenHash: hashAccessToken(requestToken),
    hourlyLimit: env.AI_HOURLY_LIMIT,
    dailyLimit: env.AI_DAILY_LIMIT
  }
}

const assertAiQuota = async (request: FastifyRequest) => {
  if (!isApiRequest(request)) return
  const hourlyLimit = request.securityContext?.hourlyLimit ?? env.AI_HOURLY_LIMIT
  const dailyLimit = request.securityContext?.dailyLimit ?? env.AI_DAILY_LIMIT
  if (hourlyLimit === 0 && dailyLimit === 0) return

  const result = await getQuotaStore().consume({
    key: getClientKey(request),
    hourlyLimit,
    dailyLimit
  })

  if (result.exceeded && result.window === "hour") {
    throw new ApiError("RATE_LIMITED", "Достигнут часовой лимит AI-запросов. Попробуйте позже.", 429, {
      limit: result.limit,
      window: "hour"
    })
  }
  if (result.exceeded && result.window === "day") {
    throw new ApiError("RATE_LIMITED", "Достигнут дневной лимит AI-запросов. Попробуйте завтра.", 429, {
      limit: result.limit,
      window: "day"
    })
  }
}

export const registerApiSecurity = (app: FastifyInstance) => {
  app.addHook("onRequest", async (request) => {
    request.securityStartedAt = Date.now()
    assertApiToken(request)
    await assertAiQuota(request)
  })

  app.addHook("onResponse", async (request, reply) => {
    if (!isApiRequest(request)) return
    const durationMs = Date.now() - (request.securityStartedAt ?? Date.now())
    recordHttpMetric({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs
    })
    app.log.info({
      event: "api_audit",
      userId: request.securityContext?.userId ?? "anonymous",
      tokenHash: request.securityContext?.tokenHash ? maskHash(request.securityContext.tokenHash) : undefined,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs,
      ip: request.ip,
      userAgent: request.headers["user-agent"]
    })
  })
}
