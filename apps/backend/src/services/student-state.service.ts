import { studentStateSchema, type GeneratePlanRequest, type StudentState } from "@ai-tutor/shared"

const topicHours = (complexity?: "low" | "medium" | "high") => {
  if (complexity === "low") return 0.08
  if (complexity === "high") return 0.5
  return 0.25
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10)

const daysBetween = (from: Date, to: Date) => Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86_400_000))

export const cleanDisciplineTitle = (value: string) => value
  .replace(/\s+/g, " ")
  .trim()

export const cleanTopicTitle = (value: string) => {
  if (value.includes("—")) return value.replace(/\s+/g, " ").trim()
  let text = value
    .replace(/\s+/g, " ")
    .replace(/^[A-ZА-Я]\d+\s+/i, "")
    .replace(/^И\s+Итоговая аттестация.*$/i, "Итоговая аттестация")
    .replace(/^ОС\s+Обратная связь.*$/i, "Обратная связь")
    .replace(/^(Тема\s+\d+)\s+Тема\s+\d+/i, "$1")
    .trim()

  const cutPatterns = [
    /\s+Учебные материалы\b/i,
    /\s+Занятие\s+\d+/i,
    /\s+Конспект\s+\d+/i,
    /\s+Глоссарий\s+\d+/i,
    /\s+Тест для самопроверки/i,
    /\s+Итоговый тест/i,
    /\s+Анкета с обратной связью/i,
    /\s+Оцените пройденный материал/i
  ]
  for (const pattern of cutPatterns) {
    const match = text.match(pattern)
    if (match?.index && match.index > 0) text = text.slice(0, match.index).trim()
  }

  return text || value.trim()
}

const finalAssessmentPattern = /\u0438\u0442\u043e\u0433\u043e\u0432(?:\u0430\u044f\s+\u0430\u0442\u0442\u0435\u0441\u0442\u0430\u0446\u0438\u044f|\u044b\u0439\s+\u0442\u0435\u0441\u0442)|\u043a\u043e\u043c\u043f\u0435\u0442\u0435\u043d\u0442\u043d\u043e\u0441\u0442\u043d(?:\u044b\u0439|\u043e\u0433\u043e)\s+\u0442\u0435\u0441\u0442|\u044d\u043a\u0437\u0430\u043c\u0435\u043d\u0430\u0446\u0438\u043e\u043d\u043d(?:\u044b\u0439|\u043e\u0433\u043e)\s+\u0442\u0435\u0441\u0442/i

const isFinalAssessmentTopic = (topic: GeneratePlanRequest["snapshot"]["disciplines"][number]["topics"][number]) =>
  topic.kind === "final_assessment" ||
  topic.kind === "final_test" ||
  topic.kind === "competency_test" ||
  finalAssessmentPattern.test(topic.title) ||
  finalAssessmentPattern.test(topic.topicTitle || "") ||
  finalAssessmentPattern.test(topic.activityTitle || "")

const canPlanFinalAssessment = (discipline: GeneratePlanRequest["snapshot"]["disciplines"][number]) => {
  if (isDisciplineSubmitted(discipline)) return false
  const regularTopics = discipline.topics.filter((topic) => !isFinalAssessmentTopic(topic))
  return regularTopics.length > 0 && regularTopics.every((topic) => topic.status === "completed")
}

const isDisciplineSubmitted = (discipline: GeneratePlanRequest["snapshot"]["disciplines"][number]) =>
  discipline.status === "completed" || Boolean(discipline.currentScore?.trim() && discipline.finalGrade?.trim())

export const buildStudentState = (request: GeneratePlanRequest): StudentState => {
  const now = new Date()
  const currentDate = isoDate(now)
  const semesterEnd = request.snapshot.progress.sessionEndDate
    ? new Date(`${request.snapshot.progress.sessionEndDate}T23:59:59`)
    : new Date(Date.now() + 45 * 86_400_000)
  const daysLeft = daysBetween(now, semesterEnd)

  const remainingItems = request.snapshot.disciplines
    .filter((discipline) => !isDisciplineSubmitted(discipline))
    .flatMap((discipline) => discipline.topics
      .filter((topic) => topic.status !== "completed")
      .filter((topic) => !isFinalAssessmentTopic(topic) || canPlanFinalAssessment(discipline))
      .map((topic) => {
        const complexity = topic.estimatedComplexity ?? "medium"
        return {
          id: topic.id,
          disciplineId: discipline.id,
          disciplineTitle: cleanDisciplineTitle(discipline.title),
          topicTitle: cleanTopicTitle(topic.title),
          activityTitle: topic.activityTitle,
          itemKind: topic.kind,
          complexity,
          estimatedHours: topicHours(complexity)
        }
      }))

  const estimatedHoursRemaining = remainingItems.reduce((sum, item) => sum + item.estimatedHours, 0)
  const availableHoursUntilDeadline = Math.max(1, daysLeft / 7) * request.preferences.hoursPerWeek
  const totalTopics = request.snapshot.progress.totalTopics
  const completedTopics = request.snapshot.progress.completedTopics

  return studentStateSchema.parse({
    generatedAt: now.toISOString(),
    student: request.snapshot.studentContext,
    semester: {
      startDate: request.snapshot.progress.sessionStartDate,
      endDate: request.snapshot.progress.sessionEndDate,
      daysLeft,
      currentDate
    },
    preferences: request.preferences,
    progress: {
      totalDisciplines: request.snapshot.progress.totalDisciplines,
      completedDisciplines: request.snapshot.progress.completedDisciplines,
      totalTopics,
      completedTopics,
      remainingTopics: Math.max(totalTopics - completedTopics, 0),
      completionPercent: totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0,
      estimatedHoursRemaining,
      availableHoursUntilDeadline
    },
    remainingItems,
    constraints: {
      maxCalendarItems: Math.max(remainingItems.length, 1),
      allowedDatesOnly: true,
      allowedTopicIds: remainingItems.map((item) => item.id),
      forbidden: [
        "Не придумывать темы, которых нет в remainingItems",
        "Не менять totalTopics, completedTopics и daysLeft",
        "Не давать ответы на контрольные или итоговые тесты",
        "Не планировать даты после semester.endDate"
      ]
    }
  })
}
