import { describe, expect, it } from "vitest"
import { anonymizeText } from "../src/content/anonymize"
import { detectForbiddenTestPage } from "../src/content/testPageGuard"
import { validatePdfFile } from "../src/utils/pdf"

describe("extension safety helpers", () => {
  it("detects official test pages", () => {
    expect(detectForbiddenTestPage("https://lms.synergy.ru/exam", "Итоговый тест")).toBe(true)
  })

  it("blocks the LMS assessments route even without test page text", () => {
    expect(detectForbiddenTestPage("https://lms.synergy.ru/assessments", "")).toBe(true)
  })

  it("does not block regular LMS study pages", () => {
    expect(detectForbiddenTestPage("https://lms.synergy.ru/student/up", "Учебный план")).toBe(false)
  })

  it("anonymizes direct identifiers", () => {
    const result = anonymizeText("ФИО: Иванов Иван ivan@test.ru +7 999 123-45-67 договор 123456789")
    expect(result).toContain("[email]")
    expect(result).toContain("[phone]")
    expect(result).toContain("[id]")
  })

  it("anonymizes tracking query urls", () => {
    const result = anonymizeText("Открой https://lms.synergy.ru/student/up?token=secret&id=123456789")
    expect(result).toContain("[url]")
    expect(result).not.toContain("token=secret")
  })

  it("validates pdf size and mime", () => {
    const file = new File(["x"], "lecture.txt", { type: "text/plain" })
    expect(validatePdfFile(file)).toContain("Файл не поддерживается")
  })
})
