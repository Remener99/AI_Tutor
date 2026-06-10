import OpenAI from "openai"
import {
  feedbackResponseSchema,
  generateCaseResponseSchema,
  generatePlanResponseSchema,
  generateQuizResponseSchema,
  generateTestPrepResponseSchema,
  generateTutorContextResponseSchema,
  practiceFeedbackResponseSchema,
  tutorChatResponseSchema,
  tutorContextDraftResponseSchema,
  type FeedbackResponse,
  type GenerateCaseResponse,
  type GeneratePlanRequest,
  type GeneratePlanResponse,
  type GenerateQuizResponse,
  type GenerateTestPrepResponse,
  type GenerateTutorContextResponse,
  type PracticeFeedbackResponse
} from "@ai-tutor/shared"
import { env } from "../config/env.js"
import { safetySystemPrompt } from "../prompts/system.js"
import { ApiError } from "../utils/errors.js"

const openAiClient = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL
    })
  : null
const activeProvider = env.LLM_MOCK ? "mock" : env.LLM_PROVIDER

const parseJson = <T>(content: string, parse: (value: unknown) => T): T => {
  try {
    return parse(JSON.parse(content))
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new ApiError("LLM_ERROR", "РќРµ СѓРґР°Р»РѕСЃСЊ СЂР°Р·РѕР±СЂР°С‚СЊ РѕС‚РІРµС‚ AI.", 502)
    return parse(JSON.parse(match[0]))
  }
}

const callOpenAiJson = async <T>(prompt: string, parse: (value: unknown) => T, timeoutMs = env.LLM_TIMEOUT_MS): Promise<T> => {
  if (!openAiClient) {
    throw new ApiError("LLM_ERROR", "OpenAI РЅРµ РЅР°СЃС‚СЂРѕРµРЅ. РЈРєР°Р¶РёС‚Рµ OPENAI_API_KEY РёР»Рё РїРµСЂРµРєР»СЋС‡РёС‚Рµ LLM_PROVIDER.", 502)
  }

  const completion = await openAiClient.chat.completions.create(
    {
      model: env.OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: safetySystemPrompt },
        { role: "user", content: prompt }
      ]
    },
    { timeout: timeoutMs }
  )

  const content = completion.choices[0]?.message?.content
  if (!content) throw new ApiError("LLM_ERROR", "AI РІРµСЂРЅСѓР» РїСѓСЃС‚РѕР№ РѕС‚РІРµС‚.", 502)
  return parseJson(content, parse)
}

const callOllamaJson = async <T>(prompt: string, parse: (value: unknown) => T, timeoutMs = env.LLM_TIMEOUT_MS): Promise<T> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const response = await fetch(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    signal: controller.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: env.OLLAMA_MODEL,
      stream: false,
      format: "json",
      options: {
        temperature: 0.3
      },
      messages: [
        { role: "system", content: safetySystemPrompt },
        { role: "user", content: prompt }
      ]
    })
  }).finally(() => clearTimeout(timeout))

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new ApiError("LLM_ERROR", `Ollama РЅРµРґРѕСЃС‚СѓРїРЅР° РёР»Рё РјРѕРґРµР»СЊ РЅРµ РѕС‚РІРµС‚РёР»Р°. ${text}`.trim(), 502)
  }

  const data = await response.json() as { message?: { content?: string }; response?: string }
  const content = data.message?.content ?? data.response
  if (!content) throw new ApiError("LLM_ERROR", "Ollama РІРµСЂРЅСѓР»Р° РїСѓСЃС‚РѕР№ РѕС‚РІРµС‚.", 502)
  return parseJson(content, parse)
}

const callProviderJson = async <T>(prompt: string, parse: (value: unknown) => T, timeoutMs = env.LLM_TIMEOUT_MS): Promise<T> => {
  if (activeProvider === "openai") return callOpenAiJson(prompt, parse, timeoutMs)
  if (activeProvider === "ollama") return callOllamaJson(prompt, parse, timeoutMs)
  throw new ApiError("LLM_ERROR", "LLM mock РЅРµ РґРѕР»Р¶РµРЅ РІС‹Р·С‹РІР°С‚СЊ РІРЅРµС€РЅРёР№ provider.", 500)
}

const weekdayIndex: Record<string, number> = {
  "Вс": 0,
  "Пн": 1,
  "Вт": 2,
  "Ср": 3,
  "Чт": 4,
  "Пт": 5,
  "Сб": 6
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10)

const formatRuDate = (date: Date) => date.toLocaleDateString("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
})

const topicHours = (complexity?: "low" | "medium" | "high") => {
  if (complexity === "low") return 0.5
  if (complexity === "high") return 1.5
  return 1
}

type StudyPlanItem = {
  discipline: { title: string }
  topic: { title: string; estimatedComplexity?: "low" | "medium" | "high" }
}

const shorten = (value: string, max = 72) => {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > max ? `${normalized.slice(0, max - 3).trim()}...` : normalized
}

const buildStudyAction = (
  item: StudyPlanItem | undefined,
  nearDeadline: boolean
) => {
  if (!item) return nearDeadline ? "Пройти итоговые материалы в LMS" : "Пройти следующий доступный материал в LMS"
  const topicTitle = shorten(item.topic.title.replace(/^Тема\s+/i, "Тема "))
  const disciplineTitle = shorten(item.discipline.title, 54)
  if (nearDeadline) return `Закрепить ${topicTitle} и проверить итоговый тест: ${disciplineTitle}`
  return `${topicTitle}: ${disciplineTitle}`
}

export const mockPlan = (request: GeneratePlanRequest): GeneratePlanResponse => {
  const total = request.snapshot.progress.totalTopics || 1
  const completed = request.snapshot.progress.completedTopics
  const remainingTopics: StudyPlanItem[] = request.snapshot.disciplines
    .flatMap((discipline) => discipline.topics.map((topic) => ({ discipline, topic })))
    .filter(({ topic }) => topic.status === "not_started")
  const remaining = Math.max(remainingTopics.length || total - completed, 0)
  const sessionEnd = new Date(request.snapshot.progress.sessionEndDate || new Date(Date.now() + 45 * 86_400_000))
  const daysLeft = Math.max(
    0,
    Math.ceil((sessionEnd.getTime() - Date.now()) / 86_400_000)
  )
  const neededHours = remainingTopics.reduce((sum, item) => sum + topicHours(item.topic.estimatedComplexity), 0) || remaining * 1
  const availableWeeks = Math.max(daysLeft / 7, 1)
  const availableHours = request.preferences.hoursPerWeek * availableWeeks
  const onTrack = availableHours >= neededHours
  const baseSessionHours = request.preferences.sessionDuration === "short" ? 0.5 : 1.5
  const sessionHours = onTrack ? baseSessionHours : Math.max(baseSessionHours, Math.min(2.5, neededHours / Math.max(daysLeft, 1) * 1.4))
  const allowedDays = onTrack
    ? request.preferences.availableDays.map((day) => weekdayIndex[day])
    : [1, 2, 3, 4, 5, 6, 0]
  const calendar: GeneratePlanResponse["calendar"] = []
  let plannedHours = 0
  let cursor = new Date()
  cursor.setHours(12, 0, 0, 0)
  const currentDate = formatDate(cursor)

  while (plannedHours < neededHours && cursor <= sessionEnd && calendar.length < 90) {
    if (allowedDays.includes(cursor.getDay())) {
      const nearDeadline = sessionEnd.getTime() - cursor.getTime() <= 10 * 86_400_000
      const target = remainingTopics[calendar.length % Math.max(remainingTopics.length, 1)]
      calendar.push({
        date: formatDate(cursor),
        action: buildStudyAction(target, nearDeadline),
        time: sessionHours < 1 ? "30 мин" : `${Number(sessionHours.toFixed(1))} ч`
      })
      plannedHours += sessionHours
    }
    cursor = new Date(cursor.getTime() + 86_400_000)
  }

  if (calendar.length === 0) {
    calendar.push({
      date: formatDate(new Date()),
      action: buildStudyAction(remainingTopics[0], false),
      time: sessionHours < 1 ? "30 мин" : `${Number(sessionHours.toFixed(1))} ч`
    })
  }

  const firstRemaining = remainingTopics[0]
  const firstAction = buildStudyAction(firstRemaining, false)
  const firstCalendarItem = calendar[0]
  const todayItems = onTrack
    ? [
        ...(firstCalendarItem && firstCalendarItem.date !== currentDate ? [`Ближайшая дата: ${formatRuDate(new Date(`${firstCalendarItem.date}T12:00:00`))}`] : []),
        "Открыть LMS и перейти к первой доступной дисциплине",
        firstAction,
        `Потратить ${firstCalendarItem?.time || "30 мин"}`
      ]
    : [
        ...(firstCalendarItem && firstCalendarItem.date !== currentDate ? [`Ближайшая дата: ${formatRuDate(new Date(`${firstCalendarItem.date}T12:00:00`))}`] : []),
        "Сегодня важно сократить отставание",
        firstAction,
        `Пройти ${Math.min(3, Math.max(1, remaining))} ближайших элемента плана`,
        `Потратить ${firstCalendarItem?.time || "1.5 ч"}`
      ]

  const markdown = [
    "## Общий прогноз",
    onTrack
      ? `Ты успеваешь закрыть всё до ${request.snapshot.progress.sessionEndDate || "конца сессии"}.`
      : `Чтобы успеть до ${request.snapshot.progress.sessionEndDate || "конца сессии"}, нужно увеличить нагрузку примерно до ${Math.ceil(neededHours / availableWeeks)} часов в неделю или добавить учебные дни.`,
    "",
    "## Календарь действий",
    "| Дата | Что делать? | Время |",
    "|---|---|---|",
    ...calendar.map((item) => `| ${item.date} | ${item.action} | ${item.time} |`),
    "",
    "## Что делать сегодня?",
    `Сегодня, ${formatRuDate(new Date())}`,
    ...todayItems.map((item) => `- ${item}`),
    "",
    "## Твой прогресс",
    `Пройдено тем: ${completed} из ${total}. Прогноз: ${onTrack ? "Успеваешь" : "Нужно ускориться"}.`
  ].join("\n")

  return generatePlanResponseSchema.parse({
    forecast: { status: onTrack ? "on_track" : "behind", text: onTrack ? "Темп выглядит реалистичным." : "Нужно усилить график." },
    calendar,
    today: { date: currentDate, items: todayItems, time: firstCalendarItem?.time },
    progress: { daysLeft, completedTopics: completed, totalTopics: total, forecast: onTrack ? "on_track" : "behind" },
    markdown
  })
}

const planNeedsFallback = (request: GeneratePlanRequest, response: GeneratePlanResponse) => {
  const remaining = Math.max(request.snapshot.progress.totalTopics - request.snapshot.progress.completedTopics, 0)
  const genericActions = response.calendar.filter((item) => /зайти\s+в\s+lms,\s*пройти\s+материал/i.test(item.action)).length
  if (response.progress.totalTopics !== request.snapshot.progress.totalTopics) return true
  if (response.progress.completedTopics !== request.snapshot.progress.completedTopics) return true
  if (remaining > 3 && response.calendar.length < 3) return true
  if (remaining > 3 && genericActions >= Math.min(3, response.calendar.length)) return true
  if (response.calendar.some((item) => !/^\d{4}-\d{2}-\d{2}$/.test(item.date))) return true
  return false
}

export const mockQuiz = (): GenerateQuizResponse => generateQuizResponseSchema.parse({
  summary: "Р›РµРєС†РёСЏ СЂР°СЃРєСЂС‹РІР°РµС‚ РєР»СЋС‡РµРІСѓСЋ РёРґРµСЋ С‚РµРјС‹ Рё РїРѕРєР°Р·С‹РІР°РµС‚, РєР°Рє РїСЂРёРјРµРЅСЏС‚СЊ РµРµ РІ СѓС‡РµР±РЅРѕР№ РёР»Рё СЂР°Р±РѕС‡РµР№ СЃРёС‚СѓР°С†РёРё. Р“Р»Р°РІРЅС‹Р№ Р°РєС†РµРЅС‚ СЃРґРµР»Р°РЅ РЅР° РїРѕРЅРёРјР°РЅРёРё РїСЂРёС‡РёРЅ, РїРѕСЃР»РµРґСЃС‚РІРёР№ Рё РѕРіСЂР°РЅРёС‡РµРЅРёР№. РњР°С‚РµСЂРёР°Р» РїРѕР»РµР·РЅРѕ СЂР°Р·Р±РёСЂР°С‚СЊ С‡РµСЂРµР· СЃРѕР±СЃС‚РІРµРЅРЅС‹Рµ РїСЂРёРјРµСЂС‹, Р° РЅРµ С‡РµСЂРµР· Р·Р°СѓС‡РёРІР°РЅРёРµ С„РѕСЂРјСѓР»РёСЂРѕРІРѕРє.",
  concepts: [
    { title: "РћСЃРЅРѕРІРЅР°СЏ РёРґРµСЏ", explanation: "Р­С‚Рѕ С†РµРЅС‚СЂР°Р»СЊРЅР°СЏ РјС‹СЃР»СЊ Р»РµРєС†РёРё, РІРѕРєСЂСѓРі РєРѕС‚РѕСЂРѕР№ СЃС‚СЂРѕСЏС‚СЃСЏ РѕСЃС‚Р°Р»СЊРЅС‹Рµ РїСЂРёРјРµСЂС‹.", example: "Р’ РїСЂРѕРµРєС‚Рµ РѕРЅР° РїРѕРјРѕРіР°РµС‚ РІС‹Р±СЂР°С‚СЊ РІРµСЂРЅС‹Р№ РїРѕСЂСЏРґРѕРє РґРµР№СЃС‚РІРёР№." },
    { title: "РџСЂР°РєС‚РёС‡РµСЃРєРѕРµ РїСЂРёРјРµРЅРµРЅРёРµ", explanation: "Р­С‚Рѕ СЃРїРѕСЃРѕР± РїРµСЂРµРЅРµСЃС‚Рё С‚РµРѕСЂРёСЋ РІ СЂРµР°Р»СЊРЅСѓСЋ Р·Р°РґР°С‡Сѓ.", example: "РќР°РїСЂРёРјРµСЂ, РѕС†РµРЅРёС‚СЊ СЂРµС€РµРЅРёРµ РїРµСЂРµРґ Р·Р°РїСѓСЃРєРѕРј РєР°РјРїР°РЅРёРё." }
  ],
  questions: [
    { id: "q1", kind: "open", question: "РљР°Рє Р±С‹ РІС‹ РѕР±СЉСЏСЃРЅРёР»Рё РіР»Р°РІРЅСѓСЋ РёРґРµСЋ Р»РµРєС†РёРё РєРѕР»Р»РµРіРµ РїСЂРѕСЃС‚С‹РјРё СЃР»РѕРІР°РјРё?", goodAnswerCriteria: ["Р•СЃС‚СЊ С†РµРЅС‚СЂР°Р»СЊРЅР°СЏ РјС‹СЃР»СЊ", "РќРµС‚ СЃР»РѕР¶РЅС‹С… С‚РµСЂРјРёРЅРѕРІ Р±РµР· РѕР±СЉСЏСЃРЅРµРЅРёСЏ"] },
    { id: "q2", kind: "practical", question: "РљР°Рє РјРѕР¶РЅРѕ РїСЂРёРјРµРЅРёС‚СЊ СЌС‚Сѓ РёРґРµСЋ РІ СѓС‡РµР±РЅРѕРј РёР»Рё СЂР°Р±РѕС‡РµРј РїСЂРѕРµРєС‚Рµ?", goodAnswerCriteria: ["Р•СЃС‚СЊ РєРѕРЅРєСЂРµС‚РЅР°СЏ СЃРёС‚СѓР°С†РёСЏ", "РџРѕРєР°Р·Р°РЅР° СЃРІСЏР·СЊ СЃ РјР°С‚РµСЂРёР°Р»РѕРј"] },
    { id: "q3", kind: "open", question: "РљР°РєРёРµ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ Сѓ РїРѕРґС…РѕРґР°, РѕРїРёСЃР°РЅРЅРѕРіРѕ РІ Р»РµРєС†РёРё?", goodAnswerCriteria: ["РќР°Р·РІР°РЅС‹ СѓСЃР»РѕРІРёСЏ РїСЂРёРјРµРЅРёРјРѕСЃС‚Рё", "Р•СЃС‚СЊ РїСЂРёРјРµСЂ СЂРёСЃРєР°"] },
    { id: "q4", kind: "reflective", question: "Р§С‚Рѕ РІ РјР°С‚РµСЂРёР°Р»Рµ РІС‹Р·РІР°Р»Рѕ СЃРѕРјРЅРµРЅРёРµ РёР»Рё СѓРґРёРІР»РµРЅРёРµ?", goodAnswerCriteria: ["Р•СЃС‚СЊ Р»РёС‡РЅР°СЏ СЂРµР°РєС†РёСЏ", "РћР±СЉСЏСЃРЅРµРЅР° РїСЂРёС‡РёРЅР°"] },
    { id: "q5", kind: "open", question: "РљР°РєРёРµ РґРІР° РІС‹РІРѕРґР° РёР· Р»РµРєС†РёРё СЃС‚РѕРёС‚ Р·Р°РїРѕРјРЅРёС‚СЊ РґР»СЏ РїСЂР°РєС‚РёРєРё?", goodAnswerCriteria: ["Р’С‹РІРѕРґС‹ СЃС„РѕСЂРјСѓР»РёСЂРѕРІР°РЅС‹ СЃРІРѕРёРјРё СЃР»РѕРІР°РјРё", "РћРЅРё РїСЂРёРјРµРЅРёРјС‹ РЅР° РїСЂР°РєС‚РёРєРµ"] }
  ]
})

export const mockTestPrep = (): GenerateTestPrepResponse => generateTestPrepResponseSchema.parse({
  summary: "Материал раскрывает ключевую тему занятия и показывает, как основные понятия связаны между собой. Важно понять не только определения, но и логику применения: зачем нужен подход, какие задачи он решает и где у него есть ограничения. Для электронного LMS-теста полезнее всего держать в голове структуру темы, различия между близкими понятиями и один практический пример.",
  coreIdeas: [
    "Тема объясняет базовую логику явления или инструмента, с которым работает дисциплина.",
    "Понятия нужно понимать в связке: одно определяет цель, другое описывает способ действия.",
    "Практическая ценность материала появляется, когда теорию применяют к конкретной ситуации."
  ],
  keyConcepts: [
    { title: "Основная идея", explanation: "Центральная мысль материала, вокруг которой строятся остальные определения и примеры." },
    { title: "Механизм применения", explanation: "Последовательность действий или логика, по которой теория превращается в практическое решение." },
    { title: "Ограничения", explanation: "Условия, при которых подход может работать хуже или требовать корректировки." }
  ],
  insights: [
    "В тесте часто легче выбрать верный вариант, если сначала определить, какую задачу решает понятие.",
    "Похожие термины лучше различать через их роль: цель, инструмент, результат или ограничение.",
    "Пример из реальной ситуации помогает быстрее вспомнить определение, чем механическое заучивание."
  ],
  applications: [
    "В учебных заданиях: чтобы объяснять решения через понятия темы, а не только через интуицию.",
    "В рабочих ситуациях: чтобы анализировать проблему, выбирать подход и видеть ограничения.",
    "В проектной работе: чтобы обосновывать действия и связывать теорию с результатом."
  ],
  nextStep: "Прочитайте саммари и переходите к электронному тесту в LMS."
})

export const mockFeedback = (criteria: string[]): FeedbackResponse => feedbackResponseSchema.parse({
  tone: "supportive",
  summary: "РћС‚РІРµС‚ РїРѕРєР°Р·С‹РІР°РµС‚ РїРѕРЅРёРјР°РЅРёРµ РѕР±С‰РµР№ РёРґРµРё. Р•РіРѕ РјРѕР¶РЅРѕ СѓСЃРёР»РёС‚СЊ Р±РѕР»РµРµ РєРѕРЅРєСЂРµС‚РЅС‹Рј РїСЂРёРјРµСЂРѕРј Рё СЃРІСЏР·СЊСЋ СЃ РјР°С‚РµСЂРёР°Р»РѕРј Р»РµРєС†РёРё.",
  strengths: ["Р•СЃС‚СЊ РїРѕРїС‹С‚РєР° РѕР±СЉСЏСЃРЅРёС‚СЊ СЃРІРѕРёРјРё СЃР»РѕРІР°РјРё", "РћС‚РІРµС‚ РЅРµ СЃРІРѕРґРёС‚СЃСЏ Рє Р·Р°СѓС‡РµРЅРЅРѕР№ С„РѕСЂРјСѓР»РёСЂРѕРІРєРµ"],
  improve: ["Р”РѕР±Р°РІСЊС‚Рµ РѕРґРёРЅ РїСЂР°РєС‚РёС‡РµСЃРєРёР№ РїСЂРёРјРµСЂ", "РћС‚РґРµР»СЊРЅРѕ СѓРєР°Р¶РёС‚Рµ РѕРіСЂР°РЅРёС‡РµРЅРёРµ РёР»Рё СѓСЃР»РѕРІРёРµ РїСЂРёРјРµРЅРёРјРѕСЃС‚Рё"],
  criteriaChecklist: criteria.map((criterion, index) => ({
    criterion,
    status: index === 0 ? "covered" : "partially_covered"
  })),
  nextStep: "РљРѕСЂРѕС‚РєРѕ РґРѕРїРёС€РёС‚Рµ РїСЂРёРјРµСЂ РёР· СѓС‡РµР±РЅРѕР№ РёР»Рё СЂР°Р±РѕС‡РµР№ СЃРёС‚СѓР°С†РёРё."
})

export const mockCase = (): GenerateCaseResponse => generateCaseResponseSchema.parse({
  materialType: "mixed",
  title: "Диалог применения",
  gameTitle: "Миссия: увидеть смысл в ситуации",
  levelName: "Уровень 1 - первый поворот мысли",
  mission: "Научиться переносить идею лекции из теории в жизненную ситуацию.",
  lifeSituation: "Представьте, что знакомый просит объяснить, зачем ему вообще нужна эта тема. Он не хочет слушать определения, ему важно понять, где это встречается в жизни и почему это влияет на решения. У вас есть только пара минут, чтобы на простом примере показать смысл материала.",
  openingQuestion: "С какой жизненной ситуации вы бы начали объяснение, чтобы человек сам почувствовал, зачем нужна эта идея?",
  thinkingCheckpoints: ["Найти живую ситуацию", "Выделить скрытую проблему", "Связать с понятием из лекции", "Сделать вывод своими словами"],
  progressLabel: "Маршрут мышления",
  mentorHint: "Начните не с термина, а с момента из жизни, где человек сталкивается с выбором, ошибкой или последствием."
})

export const mockPracticeFeedback = (): PracticeFeedbackResponse => practiceFeedbackResponseSchema.parse({
  tutorReply: "Хорошее начало: вы уже ищете не определение, а ситуацию, где тема становится заметной. Это важный сдвиг от запоминания к применению.",
  nextQuestion: "А что в этой ситуации становится проблемой: выбор, ошибка, риск или непонимание последствий?",
  nudge: "Попробуйте назвать одну конкретную трудность, а не всю тему сразу.",
  unlockedInsight: "Теория начинает работать, когда помогает увидеть скрытую причину обычной ситуации.",
  progress: {
    stageTitle: "Нашли живую ситуацию",
    completedCheckpoints: 1,
    totalCheckpoints: 4
  },
  isComplete: false
})

export const mockTutorContext = (): GenerateTutorContextResponse => generateTutorContextResponseSchema.parse({
  materialId: "mock-material",
  title: "AI-репетитор по материалу",
  shortSummary: "Я изучил материал занятия и могу объяснить его простым языком, разобрать термины, привести пример или помочь подготовиться к LMS-тесту без готовых ответов.",
  suggestedActions: ["Мини-конспект", "Глоссарий", "Практическая работа"],
  guardrails: ["Не даю ответы на официальный LMS-тест", "Объясняю по загруженному материалу"]
})

export const mockTutorChat = () => tutorChatResponseSchema.parse({
  answer: "## Практическая работа\n\n**Цель:** перенести идею лекции в конкретную ситуацию и проверить понимание без готовых ответов.\n\n### Сценарий\nПредставьте, что вы помогаете команде принять решение по учебному или рабочему проекту. Нужно показать, как материал лекции помогает увидеть проблему и выбрать действие.\n\n### Задание 1. Найдите проблему\nОпишите одну конкретную ситуацию, где тема лекции становится полезной. Что именно там не получается, вызывает риск или требует решения?\n\n### Задание 2. Свяжите с понятием\nВыберите один термин или идею из лекции. Как она помогает разобрать эту ситуацию?\n\n### Задание 3. Предложите действие\nЧто бы вы сделали в этой ситуации, опираясь на материал лекции?\n\n### Задание 4. Сделайте вывод\nКаким одним предложением можно объяснить пользу материала для этой ситуации?",
  followUpQuestion: "Хотите, я разберу ключевой термин или приведу пример из рабочей ситуации?",
  quickActions: ["Мини-конспект", "Глоссарий", "Практическая работа"]
})

export const llmService = {
  model: env.LLM_PROVIDER === "ollama" ? env.OLLAMA_MODEL : env.OPENAI_MODEL,
  activeProvider,
  generateJson: <T>(prompt: string, parse: (value: unknown) => T, timeoutMs = env.LLM_TIMEOUT_MS) =>
    callProviderJson(prompt, parse, timeoutMs),
  monitoringCheck: async () => {
    if (activeProvider === "mock") return { ok: true, provider: activeProvider, model: "mock", message: "mock-ok" }
    const startedAt = Date.now()
    const model = activeProvider === "ollama" ? env.OLLAMA_MODEL : env.OPENAI_MODEL
    const missingOpenAiConfig = activeProvider === "openai" && !env.OPENAI_API_KEY
    const missingOllamaConfig = activeProvider === "ollama" && !env.OLLAMA_BASE_URL
    if (missingOpenAiConfig || missingOllamaConfig) {
      return {
        ok: false,
        provider: activeProvider,
        model,
        message: `${activeProvider} provider is not configured`,
        latencyMs: Date.now() - startedAt
      }
    }
    return {
      ok: true,
      provider: activeProvider,
      model,
      message: "provider configuration is present; external provider ping is handled by the monitor job",
      latencyMs: Date.now() - startedAt
    }
  },
  generatePlan: async (prompt: string, fallback: GeneratePlanRequest) => {
    if (activeProvider === "mock") return mockPlan(fallback)
    try {
      const response = await callProviderJson(prompt, generatePlanResponseSchema.parse, env.PLAN_LLM_TIMEOUT_MS)
      return planNeedsFallback(fallback, response) ? mockPlan(fallback) : response
    } catch {
      return mockPlan(fallback)
    }
  },
  generateQuiz: (prompt: string) =>
    activeProvider === "mock" ? Promise.resolve(mockQuiz()) : callProviderJson(prompt, generateQuizResponseSchema.parse),
  generateTestPrep: (prompt: string) =>
    activeProvider === "mock" ? Promise.resolve(mockTestPrep()) : callProviderJson(prompt, generateTestPrepResponseSchema.parse),
  generateTutorContext: (prompt: string) =>
    activeProvider === "mock" ? Promise.resolve(mockTutorContext()) : callProviderJson(prompt, tutorContextDraftResponseSchema.parse),
  tutorChat: (prompt: string) =>
    activeProvider === "mock" ? Promise.resolve(mockTutorChat()) : callProviderJson(prompt, tutorChatResponseSchema.parse, env.TUTOR_CHAT_TIMEOUT_MS),
  feedback: (prompt: string, criteria: string[]) =>
    activeProvider === "mock" ? Promise.resolve(mockFeedback(criteria)) : callProviderJson(prompt, feedbackResponseSchema.parse),
  practiceFeedback: (prompt: string) =>
    activeProvider === "mock" ? Promise.resolve(mockPracticeFeedback()) : callProviderJson(prompt, practiceFeedbackResponseSchema.parse),
  generateCase: (prompt: string) =>
    activeProvider === "mock" ? Promise.resolve(mockCase()) : callProviderJson(prompt, generateCaseResponseSchema.parse)
}

