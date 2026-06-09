import { ApiError } from "../utils/errors.js"

export const assertNotForbidden = (isForbiddenTestPage?: boolean) => {
  if (isForbiddenTestPage) {
    throw new ApiError("SAFETY_BLOCKED", "AI-тьютор недоступен на страницах официальных тестов.", 403)
  }
}

export const hasUnsafeQuizPattern = (text: string) => /(^|\n)\s*[A-DА-Г][).]|выберите\s+верн|правильн(ый|ое)\s+ответ/i.test(text)
