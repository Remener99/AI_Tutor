import type { FastifyInstance, FastifyRequest } from "fastify"
import { env } from "../config/env.js"
import { llmService } from "../services/llm.service.js"
import { getQuotaStore } from "../services/quota-store.service.js"
import { getHttpMetricsSnapshot } from "../services/status-metrics.service.js"
import { ApiError } from "../utils/errors.js"

const getHeader = (request: FastifyRequest, name: string) => {
  const value = request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

const assertAdmin = (request: FastifyRequest) => {
  if (!env.ADMIN_API_TOKEN) {
    throw new ApiError("UNAUTHORIZED", "Admin API is disabled.", 404)
  }
  if (getHeader(request, "x-ai-tutor-admin-token") !== env.ADMIN_API_TOKEN) {
    throw new ApiError("UNAUTHORIZED", "Invalid admin token.", 401)
  }
}

const time = async <T>(fn: () => Promise<T>) => {
  const startedAt = Date.now()
  const result = await fn()
  return { result, latencyMs: Date.now() - startedAt }
}

const handleAiCheck = async (app: FastifyInstance, request: FastifyRequest) => {
  assertAdmin(request)
  try {
    const check = await time(() => llmService.monitoringCheck())
    app.log.info({
      event: "monitoring_ai_check",
      ok: check.result.ok,
      provider: check.result.provider,
      model: check.result.model,
      latencyMs: check.latencyMs
    })
    return {
      ok: check.result.ok,
      provider: check.result.provider,
      model: check.result.model,
      latencyMs: check.latencyMs,
      message: check.result.message
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI provider check failed"
    app.log.error({
      event: "monitoring_ai_check",
      ok: false,
      provider: llmService.activeProvider,
      model: llmService.model,
      error: message
    })
    return {
      ok: false,
      provider: llmService.activeProvider,
      model: llmService.model,
      latencyMs: 0,
      message
    }
  }
}

export const registerMonitoringRoutes = async (app: FastifyInstance) => {
  app.get("/admin/monitoring/status", async (request) => {
    assertAdmin(request)
    const quota = await time(() => getQuotaStore().ping())
    return {
      ok: true,
      service: "ai-tutor-backend",
      timestamp: new Date().toISOString(),
      quotaStore: {
        ok: quota.result.ok,
        kind: getQuotaStore().kind,
        latencyMs: quota.latencyMs
      },
      http: getHttpMetricsSnapshot()
    }
  })

  app.get("/admin/monitoring/ai-check", async (request) => handleAiCheck(app, request))
  app.post("/admin/monitoring/ai-check", async (request) => handleAiCheck(app, request))
}
