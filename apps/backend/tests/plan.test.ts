import { readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { mockLmsSnapshot, type GeneratePlanRequest } from "@ai-tutor/shared"

const plansPath = join(tmpdir(), "ai-tutor-plan-test-plans.json")

const payload = {
  snapshot: mockLmsSnapshot,
  preferences: {
    hoursPerWeek: 6,
    availableDays: ["Пн", "Ср"],
    strategy: "sequential",
    sessionDuration: "long"
  }
}

const finalAssessmentTitle = "\u0418\u0442\u043e\u0433\u043e\u0432\u0430\u044f \u0430\u0442\u0442\u0435\u0441\u0442\u0430\u0446\u0438\u044f"

describe("plan endpoint", () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv("LLM_MOCK", "true")
    vi.stubEnv("LLM_PROVIDER", "mock")
    vi.stubEnv("PLAN_STORAGE_PATH", plansPath)
    await rm(plansPath, { force: true })
  })

  it("generates an AI planner-compatible response", async () => {
    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      payload
    })

    const json = response.json()
    expect(response.statusCode).toBe(200)
    expect(json.markdown).toContain("Общий прогноз")
    expect(json.planMeta.source).toBe("fallback")
    expect(json.today.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const remainingTopics = mockLmsSnapshot.disciplines.flatMap((discipline) => discipline.topics).filter((topic) => topic.status !== "completed")
    const plannedActivities = json.calendar.reduce((sum: number, item: { activities?: unknown[] }) => sum + (item.activities?.length ?? 1), 0)
    expect(plannedActivities).toBeGreaterThanOrEqual(remainingTopics.length)
    expect(json.calendar[0].action).toContain("—")
    await app.close()
  }, 15_000)

  it("saves generated plan results", async () => {
    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      payload
    })

    expect(response.statusCode).toBe(200)
    const plans = JSON.parse(await readFile(plansPath, "utf8"))
    expect(Array.isArray(plans)).toBe(true)
    expect(plans[0].state.progress.totalTopics).toBe(mockLmsSnapshot.progress.totalTopics)
    expect(plans[0].plan.planMeta.source).toBe("fallback")
    await app.close()
  }, 15_000)

  it("does not plan final assessment before regular topics are completed", async () => {
    const { buildStudentState } = await import("../src/services/student-state.service.js")
    const request: GeneratePlanRequest = {
      ...payload,
      snapshot: {
        ...mockLmsSnapshot,
        disciplines: [{
          ...mockLmsSnapshot.disciplines[0],
          status: "in_progress",
          topics: [
            { id: "topic-regular", title: "\u0422\u0435\u043c\u0430 1 \u2014 \u0417\u0430\u043d\u044f\u0442\u0438\u0435 1.1", status: "not_started", estimatedComplexity: "medium" },
            { id: "topic-final", title: finalAssessmentTitle, kind: "final_assessment", status: "not_started", estimatedComplexity: "high" }
          ]
        }],
        progress: {
          ...mockLmsSnapshot.progress,
          totalTopics: 2,
          completedTopics: 0
        }
      }
    }

    const state = buildStudentState(request)
    expect(state.remainingItems.map((item) => item.topicTitle)).not.toContain(finalAssessmentTitle)
    expect(state.remainingItems).toHaveLength(1)
  })

  it("plans final assessment only after regular topics are completed", async () => {
    const { buildStudentState } = await import("../src/services/student-state.service.js")
    const request: GeneratePlanRequest = {
      ...payload,
      snapshot: {
        ...mockLmsSnapshot,
        disciplines: [{
          ...mockLmsSnapshot.disciplines[0],
          status: "in_progress",
          topics: [
            { id: "topic-regular", title: "\u0422\u0435\u043c\u0430 1 \u2014 \u0417\u0430\u043d\u044f\u0442\u0438\u0435 1.1", status: "completed", estimatedComplexity: "medium" },
            { id: "topic-final", title: finalAssessmentTitle, kind: "final_assessment", status: "not_started", estimatedComplexity: "high" }
          ]
        }],
        progress: {
          ...mockLmsSnapshot.progress,
          totalTopics: 2,
          completedTopics: 1
        }
      }
    }

    const state = buildStudentState(request)
    expect(state.remainingItems.map((item) => item.topicTitle)).toContain(finalAssessmentTitle)
    expect(state.remainingItems).toHaveLength(1)
  })

  it("treats final tests as locked until regular topics are completed", async () => {
    const { buildStudentState } = await import("../src/services/student-state.service.js")
    const finalTestTitle = "\u0418\u0442\u043e\u0433\u043e\u0432\u044b\u0439 \u0442\u0435\u0441\u0442"
    const request: GeneratePlanRequest = {
      ...payload,
      snapshot: {
        ...mockLmsSnapshot,
        disciplines: [{
          ...mockLmsSnapshot.disciplines[0],
          status: "in_progress",
          topics: [
            { id: "topic-regular", title: "\u0422\u0435\u043c\u0430 1 \u2014 \u0417\u0430\u043d\u044f\u0442\u0438\u0435 1.1", status: "not_started", estimatedComplexity: "medium" },
            { id: "topic-final-test", title: finalTestTitle, kind: "final_test", status: "not_started", estimatedComplexity: "high" }
          ]
        }],
        progress: {
          ...mockLmsSnapshot.progress,
          totalTopics: 2,
          completedTopics: 0
        }
      }
    }

    const state = buildStudentState(request)
    expect(state.remainingItems.map((item) => item.topicTitle)).not.toContain(finalTestTitle)
    expect(state.remainingItems).toHaveLength(1)
  })

  it("plans final tests after regular topics are completed", async () => {
    const { buildStudentState } = await import("../src/services/student-state.service.js")
    const finalTestTitle = "\u0418\u0442\u043e\u0433\u043e\u0432\u044b\u0439 \u0442\u0435\u0441\u0442"
    const request: GeneratePlanRequest = {
      ...payload,
      snapshot: {
        ...mockLmsSnapshot,
        disciplines: [{
          ...mockLmsSnapshot.disciplines[0],
          status: "in_progress",
          topics: [
            { id: "topic-regular", title: "\u0422\u0435\u043c\u0430 1 \u2014 \u0417\u0430\u043d\u044f\u0442\u0438\u0435 1.1", status: "completed", estimatedComplexity: "medium" },
            { id: "topic-final-test", title: finalTestTitle, kind: "final_test", status: "not_started", estimatedComplexity: "high" }
          ]
        }],
        progress: {
          ...mockLmsSnapshot.progress,
          totalTopics: 2,
          completedTopics: 1
        }
      }
    }

    const state = buildStudentState(request)
    expect(state.remainingItems.map((item) => item.topicTitle)).toContain(finalTestTitle)
    expect(state.remainingItems[0].itemKind).toBe("final_test")
  })

  it("does not generate a calendar made from blocked final assessments", async () => {
    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const request: GeneratePlanRequest = {
      ...payload,
      snapshot: {
        ...mockLmsSnapshot,
        disciplines: [{
          ...mockLmsSnapshot.disciplines[0],
          status: "in_progress",
          currentScore: "",
          finalGrade: "",
          topics: [
            { id: "topic-regular", title: "\u0422\u0435\u043c\u0430 1 \u2014 \u0417\u0430\u043d\u044f\u0442\u0438\u0435 1.1", status: "not_started", estimatedComplexity: "medium" },
            { id: "topic-final", title: finalAssessmentTitle, kind: "final_assessment", status: "not_started", estimatedComplexity: "high" }
          ]
        }],
        progress: {
          ...mockLmsSnapshot.progress,
          totalTopics: 2,
          completedTopics: 0
        }
      }
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      payload: request
    })

    const json = response.json()
    expect(response.statusCode).toBe(200)
    expect(json.calendar.map((item: { action: string }) => item.action).join("\n")).not.toContain(finalAssessmentTitle)
    expect(json.calendar[0].action).toContain("\u0417\u0430\u043d\u044f\u0442\u0438\u0435 1.1")
    await app.close()
  }, 15_000)

  it("does not plan submitted disciplines when currentScore and finalGrade are present", async () => {
    const { buildStudentState } = await import("../src/services/student-state.service.js")
    const request: GeneratePlanRequest = {
      ...payload,
      snapshot: {
        ...mockLmsSnapshot,
        disciplines: [{
          ...mockLmsSnapshot.disciplines[0],
          status: "completed",
          currentScore: "85",
          finalGrade: "отлично",
          topics: [
            { id: "topic-final", title: finalAssessmentTitle, kind: "final_assessment", status: "not_started", estimatedComplexity: "high" }
          ]
        }],
        progress: {
          ...mockLmsSnapshot.progress,
          totalDisciplines: 1,
          completedDisciplines: 1,
          totalTopics: 1,
          completedTopics: 1
        }
      }
    }

    const state = buildStudentState(request)
    expect(state.remainingItems).toHaveLength(0)
    expect(state.progress.remainingTopics).toBe(0)
  })

  it("does not plan a submitted discipline when LMS status is stale but score and grade are visible", async () => {
    const { buildStudentState } = await import("../src/services/student-state.service.js")
    const request: GeneratePlanRequest = {
      ...payload,
      snapshot: {
        ...mockLmsSnapshot,
        disciplines: [{
          ...mockLmsSnapshot.disciplines[0],
          status: "in_progress",
          currentScore: "85",
          finalGrade: "Хорошо",
          topics: [
            { id: "topic-stale", title: "Тема 5 — Занятие 5.1", status: "not_started", estimatedComplexity: "medium" },
            { id: "topic-final", title: finalAssessmentTitle, kind: "final_assessment", status: "not_started", estimatedComplexity: "high" }
          ]
        }],
        progress: {
          ...mockLmsSnapshot.progress,
          totalDisciplines: 1,
          completedDisciplines: 1,
          totalTopics: 2,
          completedTopics: 2
        }
      }
    }

    const state = buildStudentState(request)
    expect(state.remainingItems).toHaveLength(0)
    expect(state.progress.remainingTopics).toBe(0)
  })

  it("does not plan regular topics from a completed discipline even if topic markers are stale", async () => {
    const { buildStudentState } = await import("../src/services/student-state.service.js")
    const request: GeneratePlanRequest = {
      ...payload,
      snapshot: {
        ...mockLmsSnapshot,
        disciplines: [{
          ...mockLmsSnapshot.disciplines[0],
          status: "completed",
          currentScore: "74",
          finalGrade: "хорошо",
          topics: [
            { id: "topic-stale", title: "Тема 1 — Занятие 1.1", status: "not_started", estimatedComplexity: "medium" }
          ]
        }],
        progress: {
          ...mockLmsSnapshot.progress,
          totalDisciplines: 1,
          completedDisciplines: 1,
          totalTopics: 1,
          completedTopics: 1
        }
      }
    }

    const state = buildStudentState(request)
    expect(state.remainingItems).toHaveLength(0)
  })

  it("returns practice recommendations for calendar items in fallback mode", async () => {
    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      payload
    })

    const json = response.json()
    expect(response.statusCode).toBe(200)
    expect(json.calendar.length).toBeGreaterThan(0)
    expect(json.calendar.every((item: { practiceRecommendation?: string }) => typeof item.practiceRecommendation === "string" && item.practiceRecommendation.length > 10)).toBe(true)
    await app.close()
  }, 15_000)

  it("makes it explicit when the next planned action is not today", async () => {
    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      payload
    })

    const json = response.json()
    expect(response.statusCode).toBe(200)
    if (json.calendar[0]?.date !== json.today.date) {
      expect(json.today.items[0]).toContain("Ближайшая дата")
    }
    await app.close()
  }, 15_000)

  it("blocks plan generation on official LMS assessment pages", async () => {
    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      payload: {
        ...payload,
        snapshot: {
          ...mockLmsSnapshot,
          pageUrl: "https://lms.synergy.ru/assessments",
          isForbiddenTestPage: true
        }
      }
    })

    expect(response.statusCode).toBe(403)
    expect(response.json().error.code).toBe("SAFETY_BLOCKED")
    await app.close()
  }, 15_000)
})
