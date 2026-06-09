import { describe, expect, it } from "vitest"
import { validatePdfMeta } from "../src/services/pdf.service.js"

describe("pdf validation", () => {
  it("rejects non-pdf files", () => {
    expect(() => validatePdfMeta("text/plain", 100)).toThrow("Файл не поддерживается")
  })

  it("rejects files larger than 10mb", () => {
    expect(() => validatePdfMeta("application/pdf", 11 * 1024 * 1024)).toThrow("Файл слишком большой")
  })

  it("returns validation error for malformed multipart context", async () => {
    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const boundary = "ai-tutor-test-boundary"
    const body = [
      `--${boundary}`,
      "Content-Disposition: form-data; name=\"context\"",
      "",
      "{bad-json",
      `--${boundary}`,
      "Content-Disposition: form-data; name=\"file\"; filename=\"lecture.pdf\"",
      "Content-Type: application/pdf",
      "",
      "%PDF-1.4",
      `--${boundary}--`,
      ""
    ].join("\r\n")

    const response = await app.inject({
      method: "POST",
      url: "/api/quiz/generate",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from(body)
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe("VALIDATION_ERROR")
    await app.close()
  })
})
