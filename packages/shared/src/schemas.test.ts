import { describe, expect, it } from "vitest"
import { generatePlanRequestSchema, generatePlanResponseSchema } from "./schemas.js"
import { mockLmsSnapshot } from "./mock.js"

describe("shared schemas", () => {
  it("validates plan request dto", () => {
    const result = generatePlanRequestSchema.safeParse({
      snapshot: mockLmsSnapshot,
      preferences: {
        hoursPerWeek: 5,
        availableDays: ["Пн"],
        strategy: "sequential",
        sessionDuration: "long"
      }
    })

    expect(result.success).toBe(true)
  })

  it("validates plan response calendar items with practice recommendations", () => {
    const result = generatePlanResponseSchema.safeParse({
      forecast: {
        status: "on_track",
        text: "Темп достаточный.",
        requiredHoursPerWeek: 4
      },
      calendar: [{
        date: "2026-05-25",
        action: "Дисциплина — Тема 1 — Занятие 1.1",
        time: "1 ч",
        practiceRecommendation: "Сформулируйте один практический пример применения темы."
      }],
      today: {
        date: "2026-05-25",
        items: ["Дисциплина — Тема 1 — Занятие 1.1"],
        time: "1 ч"
      },
      progress: {
        daysLeft: 30,
        completedTopics: 2,
        totalTopics: 10,
        forecast: "on_track"
      },
      recommendations: ["Сначала закрывайте сложные темы."],
      markdown: "## План"
    })

    expect(result.success).toBe(true)
  })
})
