import { describe, expect, it } from "vitest"
import { mockLmsSnapshot, type GeneratePlanRequest } from "@ai-tutor/shared"
import { hasUnsafeQuizPattern } from "../src/services/safety.service.js"
import { buildStudentState } from "../src/services/student-state.service.js"
import { buildSmartPlan } from "../src/services/smart-plan.service.js"

const preferences: GeneratePlanRequest["preferences"] = {
  hoursPerWeek: 6,
  availableDays: ["Пн", "Вт", "Ср", "Чт", "Пт"],
  strategy: "sequential",
  sessionDuration: "short"
}

describe("planner quality and safety", () => {
  it("detects unsafe quiz-answer patterns", () => {
    expect(hasUnsafeQuizPattern("A) правильный ответ")).toBe(true)
    expect(hasUnsafeQuizPattern("выберите верный вариант")).toBe(true)
    expect(hasUnsafeQuizPattern("Разберем понятие без готового ответа")).toBe(false)
  })

  it("fallback plan contains non-empty practice recommendations for every calendar item", () => {
    const request: GeneratePlanRequest = {
      snapshot: mockLmsSnapshot,
      preferences
    }
    const state = buildStudentState(request)
    const plan = buildSmartPlan(request, state)

    expect(plan.calendar.length).toBeGreaterThan(0)
    expect(plan.calendar.every((item) => item.practiceRecommendation && item.practiceRecommendation.length > 20)).toBe(true)
  })

  it("planner does not create actions outside remaining LMS items", () => {
    const request: GeneratePlanRequest = {
      snapshot: mockLmsSnapshot,
      preferences
    }
    const state = buildStudentState(request)
    const plan = buildSmartPlan(request, state)
    const allowedActions = new Set(state.remainingItems.map((item) => `${item.disciplineTitle} — ${item.topicTitle}`))

    expect(plan.calendar.every((item) => allowedActions.has(item.action))).toBe(true)
  })

  it("builds a large fallback plan within an acceptable time budget", () => {
    const disciplines = Array.from({ length: 20 }, (_, disciplineIndex) => ({
      id: `discipline-${disciplineIndex + 1}`,
      title: `Дисциплина ${disciplineIndex + 1}`,
      status: "in_progress" as const,
      deadline: "2026-08-21",
      topics: Array.from({ length: 12 }, (_, topicIndex) => ({
        id: `discipline-${disciplineIndex + 1}-topic-${topicIndex + 1}`,
        title: `Тема ${topicIndex + 1} — Занятие ${topicIndex + 1}.1`,
        status: "not_started" as const,
        estimatedComplexity: topicIndex % 3 === 0 ? "high" as const : "medium" as const
      }))
    }))
    const request: GeneratePlanRequest = {
      snapshot: {
        ...mockLmsSnapshot,
        disciplines,
        progress: {
          ...mockLmsSnapshot.progress,
          totalDisciplines: disciplines.length,
          completedDisciplines: 0,
          totalTopics: disciplines.length * 12,
          completedTopics: 0
        }
      },
      preferences
    }

    const startedAt = performance.now()
    const state = buildStudentState(request)
    const plan = buildSmartPlan(request, state)
    const durationMs = performance.now() - startedAt

    const plannedActivities = plan.calendar.reduce((sum, item) => sum + (item.activities?.length ?? 1), 0)
    expect(plannedActivities).toBe(state.remainingItems.length)
    expect(durationMs).toBeLessThan(250)
  })
})
