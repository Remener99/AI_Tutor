import type { FastifyInstance } from "fastify"
import { generatePlanRequestSchema } from "@ai-tutor/shared"
import { generateAiPersonalPlan } from "../services/ai-planner.service.js"
import { assertNotForbidden } from "../services/safety.service.js"

export const registerPlanRoute = async (app: FastifyInstance) => {
  app.post("/api/plan/generate", async (request) => {
    const body = generatePlanRequestSchema.parse(request.body)
    assertNotForbidden(body.snapshot.isForbiddenTestPage)
    return generateAiPersonalPlan(body)
  })
}
