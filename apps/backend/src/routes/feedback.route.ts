import type { FastifyInstance } from "fastify"
import { caseFeedbackRequestSchema, feedbackRequestSchema, tutorChatRequestSchema } from "@ai-tutor/shared"
import { buildCaseFeedbackPrompt, buildFeedbackPrompt, buildTutorChatPrompt } from "../prompts/builders.js"
import { llmService } from "../services/llm.service.js"
import { getTutorMaterial } from "../services/tutor-material.service.js"
import { ApiError } from "../utils/errors.js"

export const registerFeedbackRoutes = async (app: FastifyInstance) => {
  app.post("/api/quiz/feedback", async (request) => {
    const body = feedbackRequestSchema.parse(request.body)
    return llmService.feedback(buildFeedbackPrompt(body), body.question.goodAnswerCriteria)
  })

  app.post("/api/case/feedback", async (request) => {
    const body = caseFeedbackRequestSchema.parse(request.body)
    return llmService.practiceFeedback(buildCaseFeedbackPrompt(body))
  })

  app.post("/api/tutor/chat", async (request) => {
    const body = tutorChatRequestSchema.parse(request.body)
    const material = getTutorMaterial(body.materialId)
    if (!material) throw new ApiError("VALIDATION_ERROR", "Материал занятия устарел. Загрузите PDF еще раз.", 400)
    return llmService.tutorChat(buildTutorChatPrompt(body, material.lectureText, {
      fileName: material.fileName,
      pageCount: material.pageCount
    }))
  })
}
