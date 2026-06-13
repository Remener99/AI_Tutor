import { generatePlanResponseSchema, type GeneratePlanRequest, type GeneratePlanResponse, type StudentState } from "@ai-tutor/shared"
import { z } from "zod"
import { env } from "../config/env.js"
import { buildAiPlannerPrompt } from "../prompts/plan-pipeline.js"
import { llmService } from "./llm.service.js"
import { savePlanResult } from "./plan-storage.service.js"
import { buildSmartPlan } from "./smart-plan.service.js"
import { buildStudentState } from "./student-state.service.js"

const asDateTime = (value: string) => new Date(`${value}T12:00:00`).getTime()
const formatRuDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
})

const formatActivityHours = (hours: number) => {
  const minutes = Math.max(5, Math.round((hours * 60) / 5) * 5)
  if (minutes < 60) return `${minutes} мин`
  if (minutes === 60) return "1 ч"
  const value = minutes / 60
  return `${Number(value.toFixed(2)).toString().replace(".", ",")} ч`
}
const isGenericAction = (value: string) => /зайти\s+в\s+lms,\s*пройти\s+материал/i.test(value) ||
  /^пройти\s+материал$/i.test(value.trim())

const aiEnrichmentSchema = z.object({
  orderedActions: z.array(z.string()).optional(),
  practiceRecommendations: z.array(z.object({
    action: z.string(),
    practiceRecommendation: z.string().min(12)
  })),
  recommendations: z.array(z.string()).optional()
})

const normalizeText = (value: string) => value
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim()

const canonicalAction = (item: StudentState["remainingItems"][number]) => {
  const topic = item.activityTitle && !normalizeText(item.topicTitle).includes(normalizeText(item.activityTitle))
    ? `${item.topicTitle} — ${item.activityTitle}`
    : item.topicTitle
  return `${item.disciplineTitle} — ${topic}`
}

const matchRemainingItem = (
  action: string,
  remainingItems: StudentState["remainingItems"],
  usedIds: Set<string>
) => {
  const normalizedAction = normalizeText(action)
  return remainingItems.find((item) => {
    if (usedIds.has(item.id)) return false
    const discipline = normalizeText(item.disciplineTitle)
    const topic = normalizeText(item.topicTitle)
    const activity = normalizeText(item.activityTitle || "")
    const canonical = normalizeText(canonicalAction(item))
    const disciplineMatches = normalizedAction.includes(discipline) || discipline.includes(normalizedAction)
    const topicMatches = normalizedAction.includes(topic) || canonical.includes(normalizedAction) || normalizedAction.includes(canonical)
    const activityMatches = !activity || normalizedAction.includes(activity) || canonical.includes(activity)
    return disciplineMatches && topicMatches && activityMatches
  })
}

const applyAiCalendarToState = (state: StudentState, plan: GeneratePlanResponse): GeneratePlanResponse => {
  const usedIds = new Set<string>()
  const calendar: GeneratePlanResponse["calendar"] = []

  for (const item of plan.calendar) {
    const matched = matchRemainingItem(item.action, state.remainingItems, usedIds)
    if (!matched) continue
    usedIds.add(matched.id)
    calendar.push({
      date: item.date,
      action: canonicalAction(matched),
      time: formatActivityHours(matched.estimatedHours),
      practiceRecommendation: item.practiceRecommendation,
      activities: [{
        disciplineId: matched.disciplineId,
        disciplineTitle: matched.disciplineTitle,
        topicTitle: matched.topicTitle,
        activityTitle: matched.activityTitle,
        itemKind: matched.itemKind,
        estimatedMinutes: Math.round(matched.estimatedHours * 60),
        status: "not_started"
      }]
    })
  }

  const first = calendar[0]
  const todayItems = first
    ? [
        ...(first.date === state.semester.currentDate ? [] : [`Ближайшая дата: ${formatRuDate(first.date)}`]),
        first.action,
        `Потратить ${first.time}`
      ]
    : ["Все темы закрыты"]

  return {
    ...plan,
    calendar,
    today: {
      ...plan.today,
      date: state.semester.currentDate,
      items: todayItems,
      time: first?.time
    },
    progress: {
      daysLeft: state.semester.daysLeft,
      completedTopics: state.progress.completedTopics,
      totalTopics: state.progress.totalTopics,
      forecast: plan.forecast.status
    }
  }
}

const validatePlanFacts = (state: StudentState, plan: GeneratePlanResponse) => {
  const warnings: string[] = []
  if (plan.progress.daysLeft !== state.semester.daysLeft) warnings.push("progress.daysLeft не совпадает со student_state")
  if (plan.progress.completedTopics !== state.progress.completedTopics) warnings.push("progress.completedTopics не совпадает со student_state")
  if (plan.progress.totalTopics !== state.progress.totalTopics) warnings.push("progress.totalTopics не совпадает со student_state")

  const start = asDateTime(state.semester.currentDate)
  const end = state.semester.endDate ? asDateTime(state.semester.endDate) : Number.POSITIVE_INFINITY
  for (const item of plan.calendar) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) warnings.push(`Некорректная дата в календаре: ${item.date}`)
    const time = asDateTime(item.date)
    if (time < start) warnings.push(`Дата ${item.date} раньше текущей даты`)
    if (time > end) warnings.push(`Дата ${item.date} позже окончания семестра`)
    if (isGenericAction(item.action)) warnings.push(`Слишком шаблонное действие: ${item.action}`)
  }

  const plannedActions = new Set(plan.calendar.flatMap((item) => [
    normalizeText(item.action),
    ...(item.activities ?? []).map((activity) => normalizeText(`${activity.disciplineTitle} — ${activity.topicTitle}${activity.activityTitle ? ` — ${activity.activityTitle}` : ""}`))
  ]))
  for (const item of state.remainingItems) {
    if (!plannedActions.has(normalizeText(canonicalAction(item)))) {
      warnings.push(`В календаре нет элемента из remainingItems: ${canonicalAction(item)}`)
    }
  }

  if (state.progress.remainingTopics > 0 && plan.calendar.length === 0) warnings.push("Календарь пустой при наличии оставшихся тем")
  const plannedActivityCount = plan.calendar.reduce((sum, item) => sum + Math.max(item.activities?.length ?? 1, 1), 0)
  if (plannedActivityCount < state.remainingItems.length) warnings.push(`Календарь покрывает ${plannedActivityCount} из ${state.remainingItems.length} оставшихся элементов`)
  if (plan.calendar.length > state.constraints.maxCalendarItems) warnings.push(`Календарь длиннее ${state.constraints.maxCalendarItems} пунктов`)
  return [...new Set(warnings)]
}

const withMeta = (
  plan: GeneratePlanResponse,
  source: "llm" | "llm_retry" | "fallback",
  validationWarnings: string[]
): GeneratePlanResponse => generatePlanResponseSchema.parse({
  ...plan,
  planMeta: {
    source,
    model: source === "fallback" ? undefined : llmService.model,
    generatedAt: new Date().toISOString(),
    validationWarnings
  }
})

const requestAiPlan = async (state: StudentState, feedback?: string[]) =>
  llmService.generateJson(
    buildAiPlannerPrompt(state, feedback),
    generatePlanResponseSchema.parse,
    env.PLAN_LLM_TIMEOUT_MS
  )

const finalizeAiPlan = (_request: GeneratePlanRequest, state: StudentState, plan: GeneratePlanResponse) =>
  generatePlanResponseSchema.parse(applyAiCalendarToState(state, plan))

const fallbackPlan = (request: GeneratePlanRequest, state: StudentState, warnings: string[]) =>
  withMeta(buildSmartPlan(request, state), "fallback", warnings)

const buildEnrichmentPrompt = (state: StudentState, calendar: GeneratePlanResponse["calendar"]) => {
  const visibleItems = calendar.slice(0, 18)
  const compactState = {
    student: state.student,
    semester: state.semester,
    preferences: state.preferences,
    progress: state.progress,
    visibleItems: visibleItems.map((item) => ({
      date: item.date,
      action: item.action,
      time: item.time
    }))
  }

  return `Ты AI-тьютор. Нужно быстро улучшить ближайший учебный маршрут, не переписывая весь план.

Контекст JSON:
${JSON.stringify(compactState)}

Верни строго JSON:
{
  "orderedActions": ["action из visibleItems в лучшем порядке на ближайшую неделю"],
  "practiceRecommendations": [
    {"action": "точный action из visibleItems", "practiceRecommendation": "1 конкретное практическое задание под дисциплину, тему и профиль студента"}
  ],
  "recommendations": ["1-2 коротких совета по усвоению ближайшей недели"]
}

Правила:
- Используй только action из visibleItems, не придумывай новые темы.
- orderedActions может включать не все visibleItems, но только точные action из списка.
- practiceRecommendation должна быть конкретной: мини-кейс, задача, пример применения или вопрос для самопроверки.
- Учитывай профиль студента, дисциплину и тему.
- Не пиши шаблоны вроде "выпишите один практический вывод" или "повторите ключевые понятия".
- Не давай ответы на LMS-тесты.`
}

const findCalendarItemByAction = (
  action: string,
  calendar: GeneratePlanResponse["calendar"],
  used = new Set<string>()
) => {
  const normalizedAction = normalizeText(action)
  return calendar.find((item) => {
    const key = normalizeText(item.action)
    if (used.has(key)) return false
    return key === normalizedAction || key.includes(normalizedAction) || normalizedAction.includes(key)
  })
}

const enrichPlanWithAi = async (state: StudentState, plan: GeneratePlanResponse) => {
  if (llmService.activeProvider === "mock" || plan.calendar.length === 0) return plan
  try {
    const enrichment = await llmService.generateJson(
      buildEnrichmentPrompt(state, plan.calendar),
      aiEnrichmentSchema.parse,
      Math.max(env.PLAN_LLM_TIMEOUT_MS, 30_000)
    )
    const recommendationByAction = new Map<string, string>()
    for (const recommendation of enrichment.practiceRecommendations) {
      const item = findCalendarItemByAction(recommendation.action, plan.calendar)
      if (item) recommendationByAction.set(normalizeText(item.action), recommendation.practiceRecommendation)
    }
    const ordered: GeneratePlanResponse["calendar"] = []
    const used = new Set<string>()

    for (const action of enrichment.orderedActions ?? []) {
      const item = findCalendarItemByAction(action, plan.calendar, used)
      if (!item) continue
      const key = normalizeText(item.action)
      used.add(key)
      ordered.push(item)
    }

    const reorderedCalendar = ordered.length > 0
      ? [
          ...ordered,
          ...plan.calendar.filter((item) => !used.has(normalizeText(item.action)))
        ]
      : plan.calendar

    return generatePlanResponseSchema.parse({
      ...plan,
      calendar: reorderedCalendar.map((item) => ({
        ...item,
        practiceRecommendation: recommendationByAction.get(normalizeText(item.action)) || item.practiceRecommendation
      })),
      recommendations: enrichment.recommendations?.length ? enrichment.recommendations : plan.recommendations,
      planMeta: {
        ...plan.planMeta,
        validationWarnings: [
          ...(plan.planMeta?.validationWarnings ?? []),
          "AI enriched visible weekly route"
        ]
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI enrichment не вернул валидный JSON"
    return generatePlanResponseSchema.parse({
      ...plan,
      planMeta: {
        ...plan.planMeta,
        source: plan.planMeta?.source ?? "fallback",
        generatedAt: plan.planMeta?.generatedAt ?? new Date().toISOString(),
        validationWarnings: [
          ...(plan.planMeta?.validationWarnings ?? []),
          `AI enrichment skipped: ${message}`
        ]
      }
    })
  }
}

export const generateAiPersonalPlan = async (request: GeneratePlanRequest) => {
  const state = buildStudentState(request)

  let plan: GeneratePlanResponse
  if (llmService.activeProvider === "mock") {
    plan = fallbackPlan(request, state, ["LLM mock включён, использован локальный fallback"])
  } else {
    try {
      const first = await requestAiPlan(state)
      const firstFinal = finalizeAiPlan(request, state, first)
      const firstWarnings = validatePlanFacts(state, firstFinal)
      if (firstWarnings.length === 0) {
        plan = withMeta(firstFinal, "llm", [])
      } else {
        const second = await requestAiPlan(state, firstWarnings)
        const secondFinal = finalizeAiPlan(request, state, second)
        const secondWarnings = validatePlanFacts(state, secondFinal)
        plan = secondWarnings.length === 0
          ? withMeta(secondFinal, "llm_retry", [])
          : fallbackPlan(request, state, secondWarnings)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM не вернул валидный ответ"
      plan = fallbackPlan(request, state, [message])
    }
  }

  plan = await enrichPlanWithAi(state, plan)
  await savePlanResult(state, plan)
  return plan
}
