import type {
  CaseFeedbackRequest,
  FeedbackRequest,
  FeedbackResponse,
  GenerateCaseResponse,
  GeneratePlanRequest,
  GeneratePlanResponse,
  GenerateQuizResponse,
  GenerateTestPrepResponse,
  GenerateTutorContextResponse,
  PracticeFeedbackResponse,
  StudentContext,
  TutorChatRequest,
  TutorChatResponse
} from "@ai-tutor/shared"
import { ClientApiError, mapNetworkError } from "./errors"

const API_BASE = "https://bba9tns6u21vsn66e7fq.containers.yandexcloud.net"
const API_TOKEN = "si-EQp-H0Ug2TI3RlTyD8zun4hYuZJSKZ22Z7We54f8"
const API_HEADERS = {
  "x-ai-tutor-api-token": API_TOKEN,
  "x-ai-tutor-user-token": API_TOKEN
}

const isExtensionContextError = (error: unknown) =>
  error instanceof Error && /extension context invalidated|context invalidated|receiving end does not exist/i.test(error.message)

const parseResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") ?? ""
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => undefined)
    : undefined
  if (!response.ok || data?.ok === false) {
    throw new ClientApiError(
      data?.error?.code ?? "API_ERROR",
      data?.error?.message ?? `Сервис AI-тьютора вернул ошибку ${response.status}.`
    )
  }
  if (data === undefined) {
    throw new ClientApiError("API_ERROR", "Сервис AI-тьютора вернул некорректный ответ.")
  }
  return data as T
}

const postJsonDirect = async <T>(path: string, payload: unknown, timeoutMs: number): Promise<T> => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { ...API_HEADERS, "content-type": "application/json" },
      body: JSON.stringify(payload)
    })
    return parseResponse<T>(response)
  } catch (error) {
    if (error instanceof ClientApiError) throw error
    throw mapNetworkError()
  } finally {
    window.clearTimeout(timeout)
  }
}

const postJson = async <T>(path: string, payload: unknown, timeoutMs = 60_000): Promise<T> => {
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage && !chrome.tabs) {
    try {
      const result = await chrome.runtime.sendMessage({ type: "AI_TUTOR_API", path, payload, timeoutMs }) as { ok: boolean; data: unknown }
      if (!result?.ok) {
        const data = result?.data as { error?: { code?: string; message?: string } }
        throw new ClientApiError(data?.error?.code ?? "API_ERROR", data?.error?.message ?? "Ошибка сервиса AI-тьютора.")
      }
      return result.data as T
    } catch (error) {
      if (!isExtensionContextError(error)) throw error
    }
  }

  return postJsonDirect<T>(path, payload, timeoutMs)
}

const postPdf = async <T>(path: string, file: File, context: unknown, timeoutMs = 90_000): Promise<T> => {
  const form = new FormData()
  form.append("file", file)
  form.append("context", JSON.stringify(context))

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: API_HEADERS,
      body: form,
      signal: controller.signal
    })
    return parseResponse<T>(response)
  } catch (error) {
    if (error instanceof ClientApiError) throw error
    throw mapNetworkError()
  } finally {
    window.clearTimeout(timeout)
  }
}

export const apiClient = {
  generatePlan: (payload: GeneratePlanRequest) => postJson<GeneratePlanResponse>("/api/plan/generate", payload, 150_000),
  generateQuiz: (file: File, studentContext: StudentContext, isForbiddenTestPage?: boolean) =>
    postPdf<GenerateQuizResponse>("/api/quiz/generate", file, { studentContext, isForbiddenTestPage }),
  quizFeedback: (payload: FeedbackRequest) => postJson<FeedbackResponse>("/api/quiz/feedback", payload),
  generateTestPrep: (file: File, studentContext: StudentContext, isForbiddenTestPage?: boolean) =>
    postPdf<GenerateTestPrepResponse>("/api/test-prep/generate", file, { studentContext, isForbiddenTestPage }),
  createTutorContext: (file: File, studentContext: StudentContext, isForbiddenTestPage?: boolean) =>
    postPdf<GenerateTutorContextResponse>("/api/tutor/context", file, { studentContext, isForbiddenTestPage }),
  tutorChat: (payload: TutorChatRequest) => postJson<TutorChatResponse>("/api/tutor/chat", payload, 170_000),
  generateCase: (file: File, studentContext: StudentContext) =>
    postPdf<GenerateCaseResponse>("/api/case/generate", file, { studentContext }),
  caseFeedback: (payload: CaseFeedbackRequest) => postJson<PracticeFeedbackResponse>("/api/case/feedback", payload)
}
