import { beforeEach, describe, expect, it, vi } from "vitest"

describe("tutor chat endpoint", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("LLM_MOCK", "true")
    vi.stubEnv("LLM_PROVIDER", "mock")
  })

  it("returns a tutor answer for a stored material", async () => {
    const { buildApp } = await import("../src/app.js")
    const { saveTutorMaterial } = await import("../src/services/tutor-material.service.js")
    const materialId = saveTutorMaterial("ТРИЗ помогает искать нестандартные решения технических задач.", {
      fileName: "triz.pdf",
      pageCount: 4
    })
    const app = await buildApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/tutor/chat",
      payload: {
        materialId,
        studentContext: {
          specialty: "Менеджмент / Технологическое предпринимательство"
        },
        messages: [],
        studentMessage: "Объясни кратко"
      }
    })

    const json = response.json()
    expect(response.statusCode).toBe(200)
    expect(json.answer).toBeTruthy()
    expect(json.quickActions.length).toBeGreaterThanOrEqual(2)
    await app.close()
  })

  it("returns validation error for an expired or unknown material", async () => {
    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/tutor/chat",
      payload: {
        materialId: "mat_unknown",
        messages: [],
        studentMessage: "Объясни материал"
      }
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe("VALIDATION_ERROR")
    await app.close()
  })
})
