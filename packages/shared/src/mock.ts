import type { LmsSnapshot } from "./types.js"

export const mockLmsSnapshot: LmsSnapshot = {
  source: "synergy_lms",
  capturedAt: new Date().toISOString(),
  pageUrl: "https://lms.synergy.ru/student/course/marketing",
  isSupportedPage: true,
  isForbiddenTestPage: false,
  studentContext: {
    specialty: "Маркетинг",
    course: "3 курс",
    educationLevel: "бакалавриат",
    currentDisciplineTitle: "Маркетинг",
    currentTopicTitle: "Маркетинговая воронка"
  },
  disciplines: [
    {
      id: "discipline-1",
      title: "Маркетинг",
      status: "in_progress",
      deadline: "2026-06-30",
      topics: [
        { id: "topic-1", title: "Маркетинговая воронка", status: "completed", estimatedComplexity: "medium" },
        { id: "topic-2", title: "Каналы продвижения", status: "in_progress", estimatedComplexity: "medium" },
        { id: "topic-3", title: "Unit-экономика", status: "not_started", estimatedComplexity: "high" }
      ]
    }
  ],
  progress: {
    totalDisciplines: 1,
    completedDisciplines: 0,
    totalTopics: 3,
    completedTopics: 1,
    percent: 33,
    sessionStartDate: "2026-02-01",
    sessionEndDate: "2026-06-30"
  }
}
