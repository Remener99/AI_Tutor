import type { ApiErrorResponse } from "@ai-tutor/shared"

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorResponse["error"]["code"],
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown
  ) {
    super(message)
  }
}

export const toApiError = (error: unknown): { statusCode: number; payload: ApiErrorResponse } => {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      payload: { ok: false, error: { code: error.code, message: error.message, details: error.details } }
    }
  }

  return {
    statusCode: 500,
    payload: {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Сервис AI-тьютора временно недоступен."
      }
    }
  }
}
