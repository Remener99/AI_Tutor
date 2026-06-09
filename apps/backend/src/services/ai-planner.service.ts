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
const isGenericAction = (value: string) => /Р·Р°Р№С‚Рё\s+РІ\s+lms,\s*РїСЂРѕР№С‚Рё\s+РјР°С‚РµСЂРёР°Р»/i.test(value) ||
  /^РїСЂРѕР№С‚Рё\s+РјР°С‚РµСЂРёР°Р»$/i.test(value.trim())

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
  .replace(/С‘/g, "Рµ")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim()

const canonicalAction = (item: StudentState["remainingItems"][number]) => {
  const topic = item.activityTitle && !normalizeText(item.topicTitle).includes(normalizeText(item.activityTitle))
    ? `${item.topicTitle} вЂ” ${item.activityTitle}`
    : item.topicTitle
  return `${item.disciplineTitle} вЂ” ${topic}`
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
        ...(first.date === state.semester.currentDate ? [] : [`Р‘Р»РёР¶Р°Р№С€Р°СЏ РґР°С‚Р°: ${formatRuDate(first.date)}`]),
        first.action,
        `РџРѕС‚СЂР°С‚РёС‚СЊ ${first.time}`
      ]
    : ["Р’СЃРµ С‚РµРјС‹ Р·Р°РєСЂС‹С‚С‹"]

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
  if (plan.progress.daysLeft !== state.semester.daysLeft) warnings.push("progress.daysLeft РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃРѕ student_state")
  if (plan.progress.completedTopics !== state.progress.completedTopics) warnings.push("progress.completedTopics РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃРѕ student_state")
  if (plan.progress.totalTopics !== state.progress.totalTopics) warnings.push("progress.totalTopics РЅРµ СЃРѕРІРїР°РґР°РµС‚ СЃРѕ student_state")

  const start = asDateTime(state.semester.currentDate)
  const end = state.semester.endDate ? asDateTime(state.semester.endDate) : Number.POSITIVE_INFINITY
  for (const item of plan.calendar) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) warnings.push(`РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ РґР°С‚Р° РІ РєР°Р»РµРЅРґР°СЂРµ: ${item.date}`)
    const time = asDateTime(item.date)
    if (time < start) warnings.push(`Р”Р°С‚Р° ${item.date} СЂР°РЅСЊС€Рµ С‚РµРєСѓС‰РµР№ РґР°С‚С‹`)
    if (time > end) warnings.push(`Р”Р°С‚Р° ${item.date} РїРѕР·Р¶Рµ РѕРєРѕРЅС‡Р°РЅРёСЏ СЃРµРјРµСЃС‚СЂР°`)
    if (isGenericAction(item.action)) warnings.push(`РЎР»РёС€РєРѕРј С€Р°Р±Р»РѕРЅРЅРѕРµ РґРµР№СЃС‚РІРёРµ: ${item.action}`)
  }

  const plannedActions = new Set(plan.calendar.flatMap((item) => [
    normalizeText(item.action),
    ...(item.activities ?? []).map((activity) => normalizeText(`${activity.disciplineTitle} вЂ” ${activity.topicTitle}${activity.activityTitle ? ` вЂ” ${activity.activityTitle}` : ""}`))
  ]))
  for (const item of state.remainingItems) {
    if (!plannedActions.has(normalizeText(canonicalAction(item)))) {
      warnings.push(`Р’ РєР°Р»РµРЅРґР°СЂРµ РЅРµС‚ СЌР»РµРјРµРЅС‚Р° РёР· remainingItems: ${canonicalAction(item)}`)
    }
  }

  if (state.progress.remainingTopics > 0 && plan.calendar.length === 0) warnings.push("РљР°Р»РµРЅРґР°СЂСЊ РїСѓСЃС‚РѕР№ РїСЂРё РЅР°Р»РёС‡РёРё РѕСЃС‚Р°РІС€РёС…СЃСЏ С‚РµРј")
  const plannedActivityCount = plan.calendar.reduce((sum, item) => sum + Math.max(item.activities?.length ?? 1, 1), 0)
  if (plannedActivityCount < state.remainingItems.length) warnings.push(`РљР°Р»РµРЅРґР°СЂСЊ РїРѕРєСЂС‹РІР°РµС‚ ${plannedActivityCount} РёР· ${state.remainingItems.length} РѕСЃС‚Р°РІС€РёС…СЃСЏ СЌР»РµРјРµРЅС‚РѕРІ`)
  if (plan.calendar.length > state.constraints.maxCalendarItems) warnings.push(`РљР°Р»РµРЅРґР°СЂСЊ РґР»РёРЅРЅРµРµ ${state.constraints.maxCalendarItems} РїСѓРЅРєС‚РѕРІ`)
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

  return `РўС‹ AI-С‚СЊСЋС‚РѕСЂ. РќСѓР¶РЅРѕ Р±С‹СЃС‚СЂРѕ СѓР»СѓС‡С€РёС‚СЊ Р±Р»РёР¶Р°Р№С€РёР№ СѓС‡РµР±РЅС‹Р№ РјР°СЂС€СЂСѓС‚, РЅРµ РїРµСЂРµРїРёСЃС‹РІР°СЏ РІРµСЃСЊ РїР»Р°РЅ.

РљРѕРЅС‚РµРєСЃС‚ JSON:
${JSON.stringify(compactState)}

Р’РµСЂРЅРё СЃС‚СЂРѕРіРѕ JSON:
{
  "orderedActions": ["action РёР· visibleItems РІ Р»СѓС‡С€РµРј РїРѕСЂСЏРґРєРµ РЅР° Р±Р»РёР¶Р°Р№С€СѓСЋ РЅРµРґРµР»СЋ"],
  "practiceRecommendations": [
    {"action": "С‚РѕС‡РЅС‹Р№ action РёР· visibleItems", "practiceRecommendation": "1 РєРѕРЅРєСЂРµС‚РЅРѕРµ РїСЂР°РєС‚РёС‡РµСЃРєРѕРµ Р·Р°РґР°РЅРёРµ РїРѕРґ РґРёСЃС†РёРїР»РёРЅСѓ, С‚РµРјСѓ Рё РїСЂРѕС„РёР»СЊ СЃС‚СѓРґРµРЅС‚Р°"}
  ],
  "recommendations": ["1-2 РєРѕСЂРѕС‚РєРёС… СЃРѕРІРµС‚Р° РїРѕ СѓСЃРІРѕРµРЅРёСЋ Р±Р»РёР¶Р°Р№С€РµР№ РЅРµРґРµР»Рё"]
}

РџСЂР°РІРёР»Р°:
- РСЃРїРѕР»СЊР·СѓР№ С‚РѕР»СЊРєРѕ action РёР· visibleItems, РЅРµ РїСЂРёРґСѓРјС‹РІР°Р№ РЅРѕРІС‹Рµ С‚РµРјС‹.
- orderedActions РјРѕР¶РµС‚ РІРєР»СЋС‡Р°С‚СЊ РЅРµ РІСЃРµ visibleItems, РЅРѕ С‚РѕР»СЊРєРѕ С‚РѕС‡РЅС‹Рµ action РёР· СЃРїРёСЃРєР°.
- practiceRecommendation РґРѕР»Р¶РЅР° Р±С‹С‚СЊ РєРѕРЅРєСЂРµС‚РЅРѕР№: РјРёРЅРё-РєРµР№СЃ, Р·Р°РґР°С‡Р°, РїСЂРёРјРµСЂ РїСЂРёРјРµРЅРµРЅРёСЏ РёР»Рё РІРѕРїСЂРѕСЃ РґР»СЏ СЃР°РјРѕРїСЂРѕРІРµСЂРєРё.
- РЈС‡РёС‚С‹РІР°Р№ РїСЂРѕС„РёР»СЊ СЃС‚СѓРґРµРЅС‚Р°, РґРёСЃС†РёРїР»РёРЅСѓ Рё С‚РµРјСѓ.
- РќРµ РїРёС€Рё С€Р°Р±Р»РѕРЅС‹ РІСЂРѕРґРµ "РІС‹РїРёС€РёС‚Рµ РѕРґРёРЅ РїСЂР°РєС‚РёС‡РµСЃРєРёР№ РІС‹РІРѕРґ" РёР»Рё "РїРѕРІС‚РѕСЂРёС‚Рµ РєР»СЋС‡РµРІС‹Рµ РїРѕРЅСЏС‚РёСЏ".
- РќРµ РґР°РІР°Р№ РѕС‚РІРµС‚С‹ РЅР° LMS-С‚РµСЃС‚С‹.`
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
    const message = error instanceof Error ? error.message : "AI enrichment РЅРµ РІРµСЂРЅСѓР» РІР°Р»РёРґРЅС‹Р№ JSON"
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
    plan = fallbackPlan(request, state, ["LLM mock РІРєР»СЋС‡С‘РЅ, РёСЃРїРѕР»СЊР·РѕРІР°РЅ Р»РѕРєР°Р»СЊРЅС‹Р№ fallback"])
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
      const message = error instanceof Error ? error.message : "LLM РЅРµ РІРµСЂРЅСѓР» РІР°Р»РёРґРЅС‹Р№ РѕС‚РІРµС‚"
      plan = fallbackPlan(request, state, [message])
    }
  }

  plan = await enrichPlanWithAi(state, plan)
  await savePlanResult(state, plan)
  return plan
}
