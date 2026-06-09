import type { FastifyInstance, FastifyRequest } from "fastify"
import { caseContextSchema, quizContextSchema, testPrepContextSchema, tutorContextSchema } from "@ai-tutor/shared"
import { buildCasePrompt, buildQuizPrompt, buildTestPrepPrompt, buildTutorContextPrompt } from "../prompts/builders.js"
import { llmService } from "../services/llm.service.js"
import { extractPdfDocument, extractPdfText, validatePdfMeta } from "../services/pdf.service.js"
import { assertNotForbidden } from "../services/safety.service.js"
import { saveTutorMaterial } from "../services/tutor-material.service.js"
import { ApiError } from "../utils/errors.js"

const parseContext = (contextRaw: string) => {
  try {
    return JSON.parse(contextRaw) as unknown
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Некорректный JSON в поле context.", 400)
  }
}

const readMultipart = async (request: FastifyRequest) => {
  const parts = request.parts()
  let fileBuffer: Buffer | undefined
  let fileMime: string | undefined
  let fileName: string | undefined
  let contextRaw = "{}"

  for await (const part of parts) {
    if (part.type === "file" && part.fieldname === "file") {
      fileMime = part.mimetype
      fileName = part.filename
      fileBuffer = await part.toBuffer()
    }
    if (part.type === "field" && part.fieldname === "context" && typeof part.value === "string") {
      contextRaw = part.value
    }
  }

  if (!fileBuffer) {
    throw new ApiError("VALIDATION_ERROR", "PDF-файл не передан.", 400)
  }

  validatePdfMeta(fileMime, fileBuffer.byteLength)
  return { fileBuffer, fileName, contextRaw }
}

export const registerPdfRoutes = async (app: FastifyInstance) => {
  app.post("/api/quiz/generate", async (request) => {
    const { fileBuffer, contextRaw } = await readMultipart(request)
    const context = quizContextSchema.parse(parseContext(contextRaw))
    assertNotForbidden(context.isForbiddenTestPage)
    const lectureText = await extractPdfText(fileBuffer)
    return llmService.generateQuiz(buildQuizPrompt(lectureText, context.studentContext))
  })

  app.post("/api/test-prep/generate", async (request) => {
    const { fileBuffer, contextRaw } = await readMultipart(request)
    const context = testPrepContextSchema.parse(parseContext(contextRaw))
    assertNotForbidden(context.isForbiddenTestPage)
    const lectureText = await extractPdfText(fileBuffer)
    return llmService.generateTestPrep(buildTestPrepPrompt(lectureText, context.studentContext))
  })

  app.post("/api/tutor/context", async (request) => {
    const { fileBuffer, fileName, contextRaw } = await readMultipart(request)
    const context = tutorContextSchema.parse(parseContext(contextRaw))
    assertNotForbidden(context.isForbiddenTestPage)
    const document = await extractPdfDocument(fileBuffer)
    const materialId = saveTutorMaterial(document.text, { fileName, pageCount: document.pageCount })
    const response = await llmService.generateTutorContext(buildTutorContextPrompt(document.text, context.studentContext, { fileName, pageCount: document.pageCount }))
    return { ...response, materialId }
  })

  app.post("/api/case/generate", async (request) => {
    const { fileBuffer, contextRaw } = await readMultipart(request)
    const context = caseContextSchema.parse(parseContext(contextRaw))
    const lectureText = await extractPdfText(fileBuffer)
    return llmService.generateCase(buildCasePrompt(lectureText, context.studentContext))
  })
}
