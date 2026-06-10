import cors from "@fastify/cors"
import multipart from "@fastify/multipart"
import rateLimit from "@fastify/rate-limit"
import Fastify from "fastify"
import { ZodError } from "zod"
import { corsOrigins } from "./config/env.js"
import { registerApiSecurity } from "./middleware/api-security.js"
import { registerAdminRoutes } from "./routes/admin.route.js"
import { registerFeedbackRoutes } from "./routes/feedback.route.js"
import { registerMonitoringRoutes } from "./routes/monitoring.route.js"
import { registerPdfRoutes } from "./routes/pdf-routes.js"
import { registerPlanRoute } from "./routes/plan.route.js"
import { initQuotaStore } from "./services/quota-store.service.js"
import { toApiError, ApiError } from "./utils/errors.js"

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const isAllowedOrigin = (origin: string) =>
  corsOrigins.includes("*") ||
  corsOrigins.some((allowed) => {
    if (allowed.endsWith("*")) return origin.startsWith(allowed.slice(0, -1))
    if (allowed.includes("*")) {
      const pattern = `^${allowed.split("*").map(escapeRegExp).join(".*")}$`
      return new RegExp(pattern).test(origin)
    }
    return origin === allowed
  })

export const buildApp = async () => {
  const app = Fastify({
    logger: {
      level: "info",
      redact: ["req.headers.authorization", "req.headers.cookie"]
    },
    requestTimeout: 180_000
  })

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (isAllowedOrigin(origin)) {
        return cb(null, true)
      }
      cb(new Error("Origin is not allowed"), false)
    }
  })
  await app.register(rateLimit, { max: 60, timeWindow: "1 minute" })
  const quotaStore = await initQuotaStore(app.log)
  app.addHook("onClose", async () => {
    await quotaStore.close()
  })
  registerApiSecurity(app)
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 1 } })

  app.get("/health", async () => ({ ok: true, service: "ai-tutor-backend" }))

  await registerAdminRoutes(app)
  await registerMonitoringRoutes(app)
  await registerPlanRoute(app)
  await registerPdfRoutes(app)
  await registerFeedbackRoutes(app)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      const payload = toApiError(new ApiError("VALIDATION_ERROR", "Некорректные данные запроса.", 400, error.flatten()))
      return reply.status(payload.statusCode).send(payload.payload)
    }

    const payload = toApiError(error)
    return reply.status(payload.statusCode).send(payload.payload)
  })

  return app
}
