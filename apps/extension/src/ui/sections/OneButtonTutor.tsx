import { useEffect, useMemo, useState } from "react"
import { ArrowRight, ChevronDown, Flame, RefreshCw, Send, Sparkles } from "lucide-react"
import type { GenerateCaseResponse, GeneratePlanResponse, GenerateTestPrepResponse, GenerateTutorContextResponse, LmsSnapshot, PlanPreferences, PracticeDialogueMessage, PracticeFeedbackResponse, TutorMessage, TutorChatResponse } from "@ai-tutor/shared"
import { apiClient } from "../../api/client"
import { readCurrentProgress } from "../../content"
import { STORAGE_KEYS } from "../../storage/keys"
import { getLocal, setLocal } from "../../storage/storage"
import { validatePdfFile } from "../../utils/pdf"
import { Button } from "../components/Button"
import { ErrorState } from "../components/ErrorState"
import { FileUpload } from "../components/FileUpload"
import { TextArea } from "../components/Inputs"
import { ProgressBar } from "../components/ProgressBar"

const defaultPreferences: PlanPreferences = {
  hoursPerWeek: 6,
  availableDays: ["Пн", "Вт", "Ср", "Чт", "Пт"],
  strategy: "sequential",
  sessionDuration: "short"
}

const ROUTE_SCHEMA_VERSION = "lms-entities-v11"

const tutorQuickCommandLabels = ["Мини-конспект", "Глоссарий", "Практическая работа"]

const tutorQuickCommandPrompts: Record<string, string> = {
  "Мини-конспект": "Сделай мини-конспект по загруженной лекции. Оформи ответ в markdown: короткое введение, 4-7 ключевых тезисов, блок 'Что запомнить', блок 'Как это применять'.",
  "Глоссарий": "Составь глоссарий по загруженной PDF-лекции. Выдели основные понятия и оформи в markdown: термин, простое объяснение, зачем это важно, короткий пример.",
  "Практическая работа": "Создай практическую работу по загруженной лекции внутри обычного диалога. Оформи в markdown без чек-листов, подсказок и специальных интерактивных блоков: цель, короткий сценарий, 3-4 задания с открытыми вопросами для ответа студента. Не давай готовые ответы."
}

const cp1251Tail = "ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї"
const cp1251Bytes = new Map<string, number>()
for (let index = 0; index < cp1251Tail.length; index += 1) cp1251Bytes.set(cp1251Tail[index], 0x80 + index)
for (let code = 0x0410; code <= 0x044f; code += 1) cp1251Bytes.set(String.fromCharCode(code), code - 0x0410 + 0xc0)

const mojibakePattern = /(?:Р[\u0400-\u04ff\u00a0-\u00bf]|С[\u0400-\u04ff\u00a0-\u00bf]|вЂ|В«|В»|РІ|Р )/

const decodeCp1251Utf8Once = (value: string) => {
  const bytes: number[] = []
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const byte = cp1251Bytes.get(char)
    if (byte !== undefined) bytes.push(byte)
    else if (code <= 0x7f) bytes.push(code)
    else return value
  }
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes))
  return decoded.includes("\uFFFD") ? value : decoded
}

const repairMojibake = (value: string) => {
  let current = value
  for (let step = 0; step < 2 && mojibakePattern.test(current); step += 1) {
    const next = decodeCp1251Utf8Once(current)
    if (next === current) break
    current = next
  }
  return current
}

const repairCalendarItem = (item: CalendarItem): CalendarItem => ({
  ...item,
  action: repairMojibake(item.action),
  time: repairMojibake(item.time),
  practiceRecommendation: item.practiceRecommendation ? repairMojibake(item.practiceRecommendation) : undefined,
  activities: item.activities?.map((activity) => ({
    ...activity,
    disciplineTitle: repairMojibake(activity.disciplineTitle),
    topicTitle: repairMojibake(activity.topicTitle),
    activityTitle: activity.activityTitle ? repairMojibake(activity.activityTitle) : undefined
  }))
})

const repairPlanText = (response: GeneratePlanResponse): GeneratePlanResponse => ({
  ...response,
  markdown: repairMojibake(response.markdown),
  recommendations: (response.recommendations ?? []).map(repairMojibake),
  forecast: {
    ...response.forecast,
    text: repairMojibake(response.forecast.text)
  },
  today: {
    ...response.today,
    items: response.today.items.map(repairMojibake),
    time: response.today.time ? repairMojibake(response.today.time) : undefined
  },
  calendar: response.calendar.map(repairCalendarItem)
})

type CalendarItem = GeneratePlanResponse["calendar"][number]

type LearningActivity = {
  activeDates: string[]
  lastCompletedTopics?: number
}

type CompletionOutcome = "early" | "on_time" | "late"

type TopicCompletionLog = Record<string, {
  completedAt: string
  plannedDate: string
  action: string
  outcome?: CompletionOutcome
  hoursDelta?: number
  note?: string
}>

type WeeklyGoal = {
  weekStart: string
  weekEnd: string
  items: CalendarItem[]
}

type AutoPlanState = {
  lastAutoDate?: string
  lastRunAt?: string
  lastProgressKey?: string
}

type TutorContext = GenerateTutorContextResponse

type TutorSessionState = {
  sessionStarted?: boolean
  tutorContext?: TutorContext | null
  tutorMessages?: TutorMessage[]
  tutorQuickActions?: string[]
  tutorInput?: string
}

type BusyAction = "route" | "tutor-start" | "tutor-message" | null

const dayAliases: Record<string, PlanPreferences["availableDays"][number]> = {
  "Пн": "Пн",
  "Вт": "Вт",
  "Ср": "Ср",
  "Чт": "Чт",
  "Пт": "Пт",
  "Сб": "Сб",
  "Вс": "Вс"
}

const normalizePreferences = (stored: PlanPreferences): PlanPreferences => {
  const availableDays = stored.availableDays
    .map((day) => dayAliases[String(day)])
    .filter((day): day is PlanPreferences["availableDays"][number] => Boolean(day))
  return { ...stored, availableDays: availableDays.length ? availableDays : defaultPreferences.availableDays }
}

const asDate = (value?: string) => {
  const date = value ? new Date(`${value}T12:00:00`) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const startOfWeek = (date = new Date()) => {
  const start = new Date(date)
  const day = start.getDay() || 7
  start.setHours(12, 0, 0, 0)
  start.setDate(start.getDate() - day + 1)
  return start
}

const endOfWeek = (date = new Date()) => {
  const end = startOfWeek(date)
  end.setDate(end.getDate() + 6)
  return end
}

const formatDate = (value?: string) => {
  const date = asDate(value)
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")
}

const formatDateRange = (date = new Date()) => {
  const start = startOfWeek(date)
  const end = endOfWeek(date)
  return `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString("ru-RU", { month: "long" })}`
}

const formatGoalDateRange = (goal?: WeeklyGoal | null, fallback = new Date()) => {
  if (!goal) return formatDateRange(fallback)
  const start = asDate(goal.weekStart)
  const end = asDate(goal.weekEnd)
  return `${start.getDate()}–${end.getDate()} ${end.toLocaleDateString("ru-RU", { month: "long" })}`
}

const parseHours = (value?: string) => {
  if (!value) return 0
  const number = Number(value.replace(",", ".").match(/\d+(\.\d+)?/)?.[0] ?? 0)
  return /мин/i.test(value) ? number / 60 : number
}

const formatHours = (hours: number) => {
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  if (!whole) return `${minutes} мин`
  if (!minutes) return `${whole} ч`
  return `${whole} ч ${minutes} мин`
}

const splitAction = (action: string) => {
  const separator = action.includes(" — ") ? " — " : action.includes(" - ") ? " - " : ": "
  const [discipline, ...topicParts] = action.split(separator)
  return { discipline, topic: topicParts.join(separator) }
}

const weekday = (date?: string) => asDate(date).toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "")
const weekdayShort = (date?: string) => {
  const jsDay = asDate(date).getDay()
  return ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][jsDay]
}

const buildWeekDays = (goal: WeeklyGoal | null) => {
  const start = goal ? asDate(goal.weekStart) : startOfWeek()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      date: formatIsoDate(date),
      label: weekdayShort(formatIsoDate(date)),
      day: date.getDate()
    }
  })
}

const normalizeText = (value: string) => value
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim()

const isRelevantWeekGoal = (goal?: WeeklyGoal | null, base = new Date()) =>
  Boolean(goal && asDate(goal.weekEnd) >= startOfWeek(base))

const extractWeekGoal = (response: GeneratePlanResponse, base = new Date()): WeeklyGoal => {
  const start = startOfWeek(base)
  const end = endOfWeek(base)
  const items = response.calendar.filter((item) => {
    const date = asDate(item.date)
    return date >= start && date <= end
  })

  if (items.length) {
    return {
      weekStart: formatIsoDate(start),
      weekEnd: formatIsoDate(end),
      items: items.slice(0, 7)
    }
  }

  const upcoming = response.calendar
    .filter((item) => asDate(item.date) >= start)
    .sort((left, right) => left.date.localeCompare(right.date))
  const firstUpcoming = upcoming[0]
  if (!firstUpcoming) {
    return {
      weekStart: formatIsoDate(start),
      weekEnd: formatIsoDate(end),
      items: []
    }
  }

  const activeStart = startOfWeek(asDate(firstUpcoming.date))
  const activeEnd = endOfWeek(asDate(firstUpcoming.date))
  return {
    weekStart: formatIsoDate(activeStart),
    weekEnd: formatIsoDate(activeEnd),
    items: upcoming.filter((item) => {
      const date = asDate(item.date)
      return date >= activeStart && date <= activeEnd
    }).slice(0, 7)
  }
}

const plannedItemKey = (item: CalendarItem) => normalizeText(item.action)

const activityAction = (activity: NonNullable<CalendarItem["activities"]>[number]) =>
  `${activity.disciplineTitle} — ${activity.topicTitle}${activity.activityTitle ? ` — ${activity.activityTitle}` : ""}`

const compareIsoDates = (left: string, right: string) => left.localeCompare(right)
const resolveCompletionOutcome = (plannedDate: string, completedAt: string): CompletionOutcome => {
  const diff = compareIsoDates(completedAt, plannedDate)
  if (diff < 0) return "early"
  if (diff > 0) return "late"
  return "on_time"
}

const completionImpact = (item: CalendarItem, completedAt: string) => {
  const outcome = resolveCompletionOutcome(item.date, completedAt)
  const hours = parseHours(item.time)
  if (outcome === "early") {
    const saved = Math.min(hours * 0.25, 0.5)
    return {
      outcome,
      hoursDelta: -saved,
      note: `Закрыто раньше плана: нагрузка недели снижена примерно на ${formatHours(saved)}.`
    }
  }
  if (outcome === "late") {
    const added = Math.max(hours * 0.25, 0.25)
    return {
      outcome,
      hoursDelta: added,
      note: `Закрыто позже плана: часть нагрузки уже переносилась и увеличивала давление на неделю.`
    }
  }
  return {
    outcome,
    hoursDelta: 0,
    note: "Закрыто по плану: маршрут недели идет в заданном темпе."
  }
}

const inflateTimeForOverdue = (time: string) => formatHours(parseHours(time) + Math.max(parseHours(time) * 0.25, 0.25))

const nextStudyDateThisWeek = (from: Date, goal: WeeklyGoal, preferences: PlanPreferences) => {
  const start = asDate(goal.weekStart)
  const end = asDate(goal.weekEnd)
  const allowed = new Set(preferences.availableDays.map((day) => dayAliases[String(day)] || day))
  const cursor = new Date(Math.max(from.getTime(), start.getTime()))
  while (cursor <= end) {
    const day = weekday(formatIsoDate(cursor)) as PlanPreferences["availableDays"][number]
    if (allowed.size === 0 || allowed.has(day)) return formatIsoDate(cursor)
    cursor.setDate(cursor.getDate() + 1)
  }
  return formatIsoDate(end)
}

const adaptWeekItems = (
  goal: WeeklyGoal | null,
  completionLog: TopicCompletionLog,
  preferences: PlanPreferences,
  base = new Date()
) => {
  if (!goal) return []
  const todayKey = formatIsoDate(base)
  const today = asDate(todayKey)
  return goal.items
    .map((item) => {
      const completion = completionLog[plannedItemKey(item)]
      if (completion) return { ...item, date: completion.completedAt }
      if (compareIsoDates(item.date, todayKey) >= 0) return item
      return {
        ...item,
        date: nextStudyDateThisWeek(today, goal, preferences),
        time: inflateTimeForOverdue(item.time),
        practiceRecommendation: `Перенесено из-за просрочки: сначала закройте этот шаг, затем коротко проверьте понимание через пример из практики. ${item.practiceRecommendation || ""}`.trim()
      }
    })
    .sort((left, right) => left.date.localeCompare(right.date))
}

const applyCompletionLogToItems = (items: CalendarItem[], completionLog: TopicCompletionLog) =>
  items.map((item) => {
    const completion = completionLog[plannedItemKey(item)]
    return completion ? { ...item, date: completion.completedAt } : item
  })

const mergeWeekGoal = (previous: WeeklyGoal | null, next: WeeklyGoal, completionLog: TopicCompletionLog = {}) => {
  if (!previous || previous.weekStart !== next.weekStart || previous.weekEnd !== next.weekEnd) {
    return { ...next, items: applyCompletionLogToItems(next.items, completionLog) }
  }
  const items = applyCompletionLogToItems([...next.items], completionLog)
  for (const item of previous.items) {
    const key = plannedItemKey(item)
    const completed = completionLog[key]
    if (completed && !items.some((existing) => plannedItemKey(existing) === key)) {
      items.push({ ...item, date: completed.completedAt })
    }
  }
  items.sort((left, right) => left.date.localeCompare(right.date))
  const start = asDate(next.weekStart)
  const end = asDate(next.weekEnd)
  return { ...next, items: items.filter((item) => {
    const date = asDate(item.date)
    return date >= start && date <= end
  }) }
}

const isDisciplineSubmittedSnapshot = (discipline: LmsSnapshot["disciplines"][number]) =>
  discipline.status === "completed" || Boolean(discipline.currentScore?.trim() && discipline.finalGrade?.trim())

const getCompletedTopicKeys = (progress?: LmsSnapshot | null) => {
  const completed: Array<{ discipline: string; topic: string; combined: string; disciplineSubmitted?: boolean }> = []
  for (const discipline of progress?.disciplines ?? []) {
    const disciplineText = normalizeText(discipline.title)
    if (isDisciplineSubmittedSnapshot(discipline)) {
      completed.push({
        discipline: disciplineText,
        topic: "",
        combined: disciplineText,
        disciplineSubmitted: true
      })
    }
    for (const topic of discipline.topics) {
      if (topic.status === "completed") {
        const topicText = normalizeText(topic.title)
        completed.push({ discipline: disciplineText, topic: topicText, combined: normalizeText(`${discipline.title} ${topic.title}`) })
      }
    }
  }
  return completed
}

const isPlannedItemCompleted = (item: CalendarItem, completedTopics: ReturnType<typeof getCompletedTopicKeys>): boolean => {
  if (item.activities?.length) {
    return item.activities.every((activity) =>
      isPlannedItemCompleted({ ...item, action: activityAction(activity), activities: undefined }, completedTopics)
    )
  }
  const { discipline, topic } = splitAction(item.action)
  const itemDiscipline = normalizeText(discipline)
  const itemTopic = normalizeText(topic || item.action)
  const itemCombined = normalizeText(item.action)

  return completedTopics.some((completed) => {
    const disciplineMatches = !itemDiscipline || completed.discipline.includes(itemDiscipline) || itemDiscipline.includes(completed.discipline)
    if (completed.disciplineSubmitted && disciplineMatches) return true
    const topicMatches = completed.topic.includes(itemTopic) || itemTopic.includes(completed.topic) || itemCombined.includes(completed.topic)
    return topicMatches && (disciplineMatches || itemCombined.includes(completed.discipline))
  })
}

const itemKey = (item: CalendarItem) => normalizeText(`${item.date} ${item.action}`)

const findDisciplineHref = (progress: LmsSnapshot | null | undefined, disciplineTitle?: string) => {
  const target = normalizeText(disciplineTitle || "")
  if (!target) return undefined
  return progress?.disciplines.find((discipline) => {
    const title = normalizeText(discipline.title)
    return title.includes(target) || target.includes(title)
  })?.href ?? undefined
}

const finalAssessmentPattern = /\u0438\u0442\u043e\u0433\u043e\u0432(?:\u0430\u044f\s+\u0430\u0442\u0442\u0435\u0441\u0442\u0430\u0446\u0438\u044f|\u044b\u0439\s+\u0442\u0435\u0441\u0442)|\u043a\u043e\u043c\u043f\u0435\u0442\u0435\u043d\u0442\u043d\u043e\u0441\u0442\u043d(?:\u044b\u0439|\u043e\u0433\u043e)\s+\u0442\u0435\u0441\u0442|\u044d\u043a\u0437\u0430\u043c\u0435\u043d\u0430\u0446\u0438\u043e\u043d\u043d(?:\u044b\u0439|\u043e\u0433\u043e)\s+\u0442\u0435\u0441\u0442/i
const isFinalAssessmentText = (value?: string) => finalAssessmentPattern.test(value || "")
const isFinalAssessmentKind = (kind?: string) =>
  kind === "final_assessment" || kind === "final_test" || kind === "competency_test"

const findDisciplineByTitle = (progress: LmsSnapshot | null | undefined, disciplineTitle?: string) => {
  const target = normalizeText(disciplineTitle || "")
  if (!target) return undefined
  return progress?.disciplines.find((discipline) => {
    const title = normalizeText(discipline.title)
    return title.includes(target) || target.includes(title)
  })
}

const canPlanFinalAssessment = (discipline: NonNullable<ReturnType<typeof findDisciplineByTitle>>) => {
  if (isDisciplineSubmittedSnapshot(discipline)) return false
  const regularTopics = discipline.topics.filter((topic) =>
    !isFinalAssessmentKind(topic.kind) &&
    !isFinalAssessmentText(topic.title) &&
    !isFinalAssessmentText(topic.topicTitle) &&
    !isFinalAssessmentText(topic.activityTitle)
  )
  return regularTopics.length > 0 && regularTopics.every((topic) => topic.status === "completed")
}

const isCalendarItemAllowed = (item: CalendarItem, progress: LmsSnapshot | null | undefined) => {
  const { discipline, topic } = splitAction(item.action)
  const hasFinalActivity = item.activities?.some((activity) =>
    isFinalAssessmentKind(activity.itemKind) ||
    isFinalAssessmentText(activity.topicTitle) ||
    isFinalAssessmentText(activity.activityTitle)
  )
  if (!hasFinalActivity && !isFinalAssessmentText(topic) && !isFinalAssessmentText(item.action)) return true
  const matchedDiscipline = findDisciplineByTitle(progress, discipline)
  if (matchedDiscipline && isDisciplineSubmittedSnapshot(matchedDiscipline)) return true
  return matchedDiscipline ? canPlanFinalAssessment(matchedDiscipline) : false
}

const sanitizeCalendarForSnapshot = (items: CalendarItem[], progress: LmsSnapshot | null | undefined) => {
  const repaired = items.map(repairCalendarItem)
  return progress ? repaired.filter((item) => isCalendarItemAllowed(item, progress)) : repaired
}

const sanitizePlanForSnapshot = (response: GeneratePlanResponse, progress: LmsSnapshot | null | undefined): GeneratePlanResponse => ({
  ...repairPlanText(response),
  calendar: sanitizeCalendarForSnapshot(response.calendar, progress)
})

const inlineMarkdownPatterns: Array<{
  pattern: RegExp
  render: (content: string, key: string) => JSX.Element
}> = [
  { pattern: /`([^`]+)`/, render: (content, key) => <code key={key}>{content}</code> },
  { pattern: /<u>([\s\S]+?)<\/u>/i, render: (content, key) => <u key={key}>{renderInlineMarkdown(content, key)}</u> },
  { pattern: /\+\+([\s\S]+?)\+\+/, render: (content, key) => <u key={key}>{renderInlineMarkdown(content, key)}</u> },
  { pattern: /\*\*\*([\s\S]+?)\*\*\*/, render: (content, key) => <strong key={key}><em>{renderInlineMarkdown(content, key)}</em></strong> },
  { pattern: /___([\s\S]+?)___/, render: (content, key) => <strong key={key}><em>{renderInlineMarkdown(content, key)}</em></strong> },
  { pattern: /\*\*([\s\S]+?)\*\*/, render: (content, key) => <strong key={key}>{renderInlineMarkdown(content, key)}</strong> },
  { pattern: /__([\s\S]+?)__/, render: (content, key) => <strong key={key}>{renderInlineMarkdown(content, key)}</strong> },
  { pattern: /\*([^*\n]+?)\*/, render: (content, key) => <em key={key}>{renderInlineMarkdown(content, key)}</em> },
  { pattern: /_([^_\n]+?)_/, render: (content, key) => <em key={key}>{renderInlineMarkdown(content, key)}</em> }
]

const renderInlineMarkdown = (value: string, keyPrefix = "inline"): Array<string | JSX.Element> => {
  if (!value) return []
  const matches = inlineMarkdownPatterns
    .map((entry) => {
      const match = entry.pattern.exec(value)
      return match ? { ...entry, match } : null
    })
    .filter(Boolean) as Array<typeof inlineMarkdownPatterns[number] & { match: RegExpExecArray }>
  const first = matches.sort((left, right) => left.match.index - right.match.index)[0]
  if (!first) return [value]

  const before = value.slice(0, first.match.index)
  const after = value.slice(first.match.index + first.match[0].length)
  const key = `${keyPrefix}-${first.match.index}-${first.match[0].length}`
  return [
    ...renderInlineMarkdown(before, `${keyPrefix}-before`),
    first.render(first.match[1], key),
    ...renderInlineMarkdown(after, `${keyPrefix}-after`)
  ]
}

type PracticeBlock = {
  kind: "markdown" | "task" | "checklist" | "hint" | "reflection"
  title?: string
  body: string
}

const getDirectiveTitle = (meta: string) => {
  const quoted = /title="([^"]+)"/.exec(meta)
  if (quoted) return quoted[1]
  const plain = meta.trim()
  return plain || undefined
}

const parsePracticeBlocks = (content: string): PracticeBlock[] => {
  const blocks: PracticeBlock[] = []
  const directivePattern = /:::(task|checklist|hint|reflection)([^\n]*)\n([\s\S]*?)\s*:::/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = directivePattern.exec(content))) {
    const before = content.slice(cursor, match.index).trim()
    if (before) blocks.push({ kind: "markdown", body: before })
    blocks.push({
      kind: match[1] as PracticeBlock["kind"],
      title: getDirectiveTitle(match[2] ?? ""),
      body: match[3].trim()
    })
    cursor = match.index + match[0].length
  }
  const rest = content.slice(cursor).trim()
  if (rest) blocks.push({ kind: "markdown", body: rest })
  return blocks.length ? blocks : [{ kind: "markdown", body: content }]
}

const isTableDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
const isTableRow = (line: string) => /^\s*\|.+\|\s*$/.test(line)
const splitTableRow = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())

const renderParagraphLines = (lines: string[], keyPrefix: string) =>
  lines.map((line, index) => (
    <span key={`${keyPrefix}-line-${index}`}>
      {index > 0 && <br />}
      {renderInlineMarkdown(line, `${keyPrefix}-inline-${index}`)}
    </span>
  ))

const BasicMarkdown = ({ content }: { content: string }) => {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const nodes: JSX.Element[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    const key = `md-${nodes.length}`

    if (!trimmed) {
      index += 1
      continue
    }

    const fence = /^```([\w-]+)?\s*$/.exec(trimmed)
    if (fence) {
      const language = (fence[1] ?? "").toLowerCase()
      const body: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        body.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      nodes.push(
        <pre className={language === "mermaid" ? "ai-mermaid-block" : undefined} key={key}>
          {language && <strong>{language === "mermaid" ? "Диаграмма" : language}</strong>}
          <code>{body.join("\n")}</code>
        </pre>
      )
      continue
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      const Tag = `h${level}` as keyof JSX.IntrinsicElements
      nodes.push(<Tag key={key}>{renderInlineMarkdown(heading[2], key)}</Tag>)
      index += 1
      continue
    }

    if (isTableRow(trimmed) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(trimmed)
      const rows: string[][] = []
      index += 2
      while (index < lines.length && isTableRow(lines[index].trim())) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      nodes.push(
        <div className="ai-markdown-table-wrap" key={key}>
          <table>
            <thead><tr>{headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInlineMarkdown(cell, `${key}-h-${cellIndex}`)}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(row[cellIndex] ?? "", `${key}-r-${rowIndex}-${cellIndex}`)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      nodes.push(<blockquote key={key}>{renderParagraphLines(quoteLines, key)}</blockquote>)
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""))
        index += 1
      }
      nodes.push(<ul key={key}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</ul>)
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""))
        index += 1
      }
      nodes.push(<ol key={key}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</ol>)
      continue
    }

    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,6})\s+/.test(lines[index].trim()) &&
      !/^```/.test(lines[index].trim()) &&
      !/^>\s?/.test(lines[index].trim()) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+[.)]\s+/.test(lines[index]) &&
      !(isTableRow(lines[index].trim()) && index + 1 < lines.length && isTableDivider(lines[index + 1]))
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    nodes.push(<p key={key}>{renderParagraphLines(paragraph, key)}</p>)
  }

  return <>{nodes}</>
}

const InteractivePracticeBlock = ({
  block,
  index,
  onSubmit
}: {
  block: PracticeBlock
  index: number
  onSubmit?: (message: string) => void
}) => {
  const [answer, setAnswer] = useState("")
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [hintVisible, setHintVisible] = useState(block.kind !== "hint")
  const listItems = block.body.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => line.replace(/^[-*]\s+/, ""))

  if (block.kind === "task" || block.kind === "reflection") {
    const label = block.kind === "task" ? "Задание" : "Рефлексия"
    return (
      <div className={`ai-practice-block is-${block.kind}`}>
        <strong>{block.title ?? label}</strong>
        <BasicMarkdown content={block.body} />
        <TextArea
          placeholder="Запишите ответ своими словами..."
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <Button disabled={!answer.trim() || !onSubmit} onClick={() => onSubmit?.(`${block.title ?? label}\n\n${answer.trim()}`)}>
          <Send size={14} /> Отправить ответ репетитору
        </Button>
      </div>
    )
  }

  if (block.kind === "checklist") {
    return (
      <div className="ai-practice-block is-checklist">
        <strong>{block.title ?? "Самопроверка"}</strong>
        <div className="ai-practice-checklist">
          {listItems.map((item, itemIndex) => (
            <label key={`${index}-${itemIndex}`}>
              <input
                checked={Boolean(checked[itemIndex])}
                type="checkbox"
                onChange={(event) => setChecked((prev) => ({ ...prev, [itemIndex]: event.target.checked }))}
              />
              <span>{renderInlineMarkdown(item)}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="ai-practice-block is-hint">
      <button type="button" onClick={() => setHintVisible((value) => !value)}>
        {hintVisible ? "Скрыть подсказку" : "Показать подсказку"}
      </button>
      {hintVisible && <BasicMarkdown content={block.body} />}
    </div>
  )
}

const ChatMessageContent = ({ content, onSubmitPractice }: { content: string; onSubmitPractice?: (message: string) => void }) => (
  <>
    {parsePracticeBlocks(content).map((block, index) => block.kind === "markdown"
      ? <BasicMarkdown content={block.body} key={`md-${index}`} />
      : <InteractivePracticeBlock block={block} index={index} key={`${block.kind}-${index}`} onSubmit={onSubmitPractice} />
    )}
  </>
)

const countConsecutiveDays = (dates: string[], base = new Date()) => {
  const unique = new Set(dates)
  const today = formatIsoDate(base)
  const yesterday = new Date(base)
  yesterday.setDate(yesterday.getDate() - 1)
  const cursor = unique.has(today) ? new Date(base) : yesterday
  let count = 0

  while (unique.has(formatIsoDate(cursor))) {
    count += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return count
}

const progressKey = (progress: LmsSnapshot) =>
  `${progress.progress.completedTopics}/${progress.progress.totalTopics}/${progress.progress.completedDisciplines}/${progress.progress.totalDisciplines}`

const routeRefreshKey = (progress: LmsSnapshot, hasOverdueOpenActivity: boolean) =>
  `${progressKey(progress)}:${hasOverdueOpenActivity ? "overdue" : "fresh"}`

export const OneButtonTutor = ({ enabled }: { enabled: boolean }) => {
  const [snapshot, setSnapshot] = useState<LmsSnapshot | null>(null)
  const [plan, setPlan] = useState<GeneratePlanResponse | null>(null)
  const [preferences, setPreferences] = useState<PlanPreferences>(defaultPreferences)
  const [learningActivity, setLearningActivity] = useState<LearningActivity>({ activeDates: [] })
  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal | null>(null)
  const [completionLog, setCompletionLog] = useState<TopicCompletionLog>({})
  const [file, setFile] = useState<File | null>(null)
  const [testPrep, setTestPrep] = useState<GenerateTestPrepResponse | null>(null)
  const [practice, setPractice] = useState<GenerateCaseResponse | null>(null)
  const [tutorContext, setTutorContext] = useState<TutorContext | null>(null)
  const [tutorMessages, setTutorMessages] = useState<TutorMessage[]>([])
  const [tutorInput, setTutorInput] = useState("")
  const [tutorQuickActions, setTutorQuickActions] = useState<string[]>([])
  const [dialogue, setDialogue] = useState<PracticeDialogueMessage[]>([])
  const [dialogueInput, setDialogueInput] = useState("")
  const [dialogueProgress, setDialogueProgress] = useState<PracticeFeedbackResponse["progress"] | null>(null)
  const [lastInsight, setLastInsight] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [autoPlanning, setAutoPlanning] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [error, setError] = useState<string>()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    void Promise.all([
      getLocal<LmsSnapshot | null>(STORAGE_KEYS.lastLmsSnapshot, null),
      getLocal<GeneratePlanResponse | null>(STORAGE_KEYS.lastPlan, null),
      getLocal<LearningActivity>(STORAGE_KEYS.learningActivity, { activeDates: [] }),
      getLocal<TopicCompletionLog>(STORAGE_KEYS.topicCompletionLog, {}),
      getLocal<WeeklyGoal | null>(STORAGE_KEYS.weeklyGoal, null),
      getLocal<PlanPreferences>(STORAGE_KEYS.userPreferences, defaultPreferences),
      getLocal<TutorSessionState>(STORAGE_KEYS.tutorSession, {}),
      getLocal<string | null>(STORAGE_KEYS.routeSchemaVersion, null)
    ]).then(([storedSnapshot, storedPlan, storedActivity, storedLog, storedGoal, storedPreferences, storedTutor, storedRouteSchemaVersion]) => {
      const routeSchemaChanged = storedRouteSchemaVersion !== ROUTE_SCHEMA_VERSION
      setSnapshot(storedSnapshot)
      const repairedStoredPlan = storedPlan ? sanitizePlanForSnapshot(storedPlan, storedSnapshot) : null
      const repairedStoredGoal = storedGoal
        ? { ...storedGoal, items: sanitizeCalendarForSnapshot(storedGoal.items, storedSnapshot) }
        : null
      setPlan(routeSchemaChanged ? null : repairedStoredPlan)
      setLearningActivity(storedActivity)
      setCompletionLog(routeSchemaChanged ? {} : storedLog)
      setWeeklyGoal(routeSchemaChanged ? null : repairedStoredGoal)
      setPreferences(normalizePreferences(storedPreferences))
      setTutorContext(storedTutor.tutorContext ?? null)
      setTutorMessages(storedTutor.tutorMessages ?? [])
      setTutorQuickActions(storedTutor.tutorQuickActions ?? [])
      setTutorInput(storedTutor.tutorInput ?? "")
      setSessionStarted(Boolean(storedTutor.sessionStarted))
      if (routeSchemaChanged) {
        void setLocal(STORAGE_KEYS.routeSchemaVersion, ROUTE_SCHEMA_VERSION)
      }
      setHydrated(true)
    })
  }, [])

  const today = new Date()
  const calendar = sanitizeCalendarForSnapshot(plan?.calendar ?? [], snapshot)
  const activeWeekGoal = weeklyGoal?.items.length
    ? weeklyGoal
    : plan
      ? extractWeekGoal({ ...plan, calendar })
      : { weekStart: formatIsoDate(startOfWeek()), weekEnd: formatIsoDate(endOfWeek()), items: calendar.slice(0, 5) }
  const weekItems = sanitizeCalendarForSnapshot(adaptWeekItems(activeWeekGoal, completionLog, preferences), snapshot)
  const completedTopicKeys = getCompletedTopicKeys(snapshot)
  const weekItemStates = useMemo(() => weekItems.map((item) => ({
    item,
    completed: Boolean(completionLog[plannedItemKey(item)]) || isPlannedItemCompleted(item, completedTopicKeys)
  })), [weekItems, completionLog, completedTopicKeys])
  const streakDays = countConsecutiveDays(learningActivity.activeDates)
  const pendingWeekItems = weekItemStates.filter((entry) => !entry.completed)
  const nextActionItem = pendingWeekItems[0]?.item
  const nextAction = nextActionItem ? splitAction(nextActionItem.action) : null
  const nextPrimaryActivity = nextActionItem?.activities?.[0]
  const nextActionDate = nextActionItem ? formatDate(nextActionItem.date) : ""
  const nextItemKey = nextActionItem ? itemKey(nextActionItem) : ""
  const nextDisciplineHref = findDisciplineHref(snapshot, nextPrimaryActivity?.disciplineTitle || nextAction?.discipline)
  const weekDays = useMemo(() => buildWeekDays(activeWeekGoal), [activeWeekGoal])
  const weekItemsByDate = useMemo(() => {
    const grouped = new Map<string, typeof weekItemStates>()
    for (const entry of weekItemStates) grouped.set(entry.item.date, [...(grouped.get(entry.item.date) ?? []), entry])
    return grouped
  }, [weekItemStates])
  const nextLabel = useMemo(() => {
    if (loading) return "Собираем маршрут..."
    if (!plan) return "Сформировать маршрут недели"
    return "Открыть занятие"
  }, [loading, plan])

  useEffect(() => {
    if (!hydrated) return
    const todayKey = formatIsoDate(new Date())
    if (learningActivity.activeDates.includes(todayKey)) return
    const next = {
      ...learningActivity,
      activeDates: [...learningActivity.activeDates, todayKey].slice(-30)
    }
    setLearningActivity(next)
    void setLocal(STORAGE_KEYS.learningActivity, next)
  }, [hydrated, learningActivity])

  const updateTopicCompletionLog = async (progress: LmsSnapshot, items: CalendarItem[]) => {
    const completedKeys = getCompletedTopicKeys(progress)
    const next = { ...completionLog }
    const completedAt = formatIsoDate(new Date())
    for (const item of items) {
      const key = plannedItemKey(item)
      if (!next[key] && isPlannedItemCompleted(item, completedKeys)) {
        next[key] = {
          completedAt,
          plannedDate: item.date,
          action: item.action,
          ...completionImpact(item, completedAt)
        }
      }
    }
    setCompletionLog(next)
    await setLocal(STORAGE_KEYS.topicCompletionLog, next)
    return next
  }

  const generatePlanFromProgress = async (progress: LmsSnapshot, options?: { silent?: boolean }) => {
    if (!options?.silent) setError(undefined)
    const response = sanitizePlanForSnapshot(await apiClient.generatePlan({ snapshot: progress, preferences }), progress)
    const extractedGoal = extractWeekGoal(response)
    const nextCompletionLog = await updateTopicCompletionLog(progress, [...(weeklyGoal?.items ?? []), ...extractedGoal.items])
    const nextWeekGoal = mergeWeekGoal(weeklyGoal, extractedGoal, nextCompletionLog)
    setSnapshot(progress)
    setPlan(response)
    setWeeklyGoal(nextWeekGoal)
    await setLocal(STORAGE_KEYS.lastLmsSnapshot, progress)
    await setLocal(STORAGE_KEYS.lastPlan, response)
    await setLocal(STORAGE_KEYS.weeklyGoal, nextWeekGoal)
    await setLocal(STORAGE_KEYS.routeSchemaVersion, ROUTE_SCHEMA_VERSION)
  }

  const readAndPlan = async () => {
    setLoading(true)
    setBusyAction("route")
    setError(undefined)
    try {
      const progress = await readCurrentProgress()
      await generatePlanFromProgress(progress)
      await setLocal<AutoPlanState>(STORAGE_KEYS.autoPlanState, {
        lastAutoDate: formatIsoDate(new Date()),
        lastRunAt: new Date().toISOString(),
        lastProgressKey: routeRefreshKey(progress, false)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сформировать маршрут недели.")
    } finally {
      setLoading(false)
      setBusyAction(null)
    }
  }

  useEffect(() => {
    if (!hydrated || !plan || loading || autoPlanning) return
    let cancelled = false
    const todayKey = formatIsoDate(new Date())
    const hasOverdueOpenActivity = weekItemStates.some((entry) =>
      !entry.completed && compareIsoDates(entry.item.date, todayKey) < 0
    )

    void (async () => {
      const storedAutoState = await getLocal<AutoPlanState>(STORAGE_KEYS.autoPlanState, {})
      try {
        const progress = await readCurrentProgress()
        const currentProgressKey = routeRefreshKey(progress, hasOverdueOpenActivity)
        const shouldRebuild = storedAutoState.lastProgressKey !== currentProgressKey
        if (!shouldRebuild && storedAutoState.lastAutoDate === todayKey) return
        setAutoPlanning(true)
        if (!cancelled && shouldRebuild) {
          await generatePlanFromProgress(progress, { silent: true })
        }
        await setLocal<AutoPlanState>(STORAGE_KEYS.autoPlanState, {
          lastAutoDate: todayKey,
          lastRunAt: new Date().toISOString(),
          lastProgressKey: currentProgressKey
        })
      } catch {
        // Auto-refresh is best effort; manual route generation still shows the actionable error.
      } finally {
        if (!cancelled) setAutoPlanning(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hydrated, plan, loading, autoPlanning, weekItemStates])

  const generateTestPrep = async () => {
    const validation = validatePdfFile(file)
    if (validation || !file) return setError(validation || "Добавьте PDF с материалом занятия.")
    setLoading(true)
    setError(undefined)
    try {
      const progress = snapshot ?? await readCurrentProgress()
      setSnapshot(progress)
      const response = await apiClient.generateTestPrep(file, progress.studentContext ?? {}, progress.isForbiddenTestPage)
      setTestPrep(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подготовить AI-конспект материала.")
    } finally {
      setLoading(false)
    }
  }

  const generatePractice = async () => {
    const validation = validatePdfFile(file)
    if (validation || !file) return setError(validation || "Добавьте PDF с материалом занятия.")
    setLoading(true)
    setError(undefined)
    try {
      const progress = snapshot ?? await readCurrentProgress()
      setSnapshot(progress)
      const response = await apiClient.generateCase(file, progress.studentContext ?? {})
      setPractice(response)
      setDialogue([{ role: "tutor", content: response.openingQuestion }])
      setDialogueInput("")
      setDialogueProgress({ stageTitle: response.thinkingCheckpoints[0] ?? response.progressLabel, completedCheckpoints: 0, totalCheckpoints: response.thinkingCheckpoints.length })
      setLastInsight(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить эвристический диалог.")
    } finally {
      setLoading(false)
    }
  }

  const createTutorContext = async () => {
    const validation = validatePdfFile(file)
    if (validation || !file) return setError(validation || "Добавьте PDF с материалом занятия.")
    setLoading(true)
    setBusyAction("tutor-start")
    setError(undefined)
    try {
      const progress = snapshot ?? await readCurrentProgress()
      setSnapshot(progress)
      const response = await apiClient.createTutorContext(file, progress.studentContext ?? {}, progress.isForbiddenTestPage)
      setTutorContext(response)
      setTutorQuickActions(tutorQuickCommandLabels)
      setTutorMessages([{
        role: "tutor",
        content: `Я изучил материал «${response.title}». ${response.shortSummary}\n\nС чего начнем?`
      }])
      setTutorInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить AI-репетитора по материалу.")
    } finally {
      setLoading(false)
      setBusyAction(null)
    }
  }

  const runPrimary = async () => {
    if (!enabled || loading) return
    if (!plan) return readAndPlan()
    let href = nextDisciplineHref
    if (!href && nextAction?.discipline) {
      const progress = await readCurrentProgress().catch(() => null)
      if (progress) {
        setSnapshot(progress)
        await setLocal(STORAGE_KEYS.lastLmsSnapshot, progress)
        href = findDisciplineHref(progress, nextPrimaryActivity?.disciplineTitle || nextAction.discipline)
      }
    }
    if (href && location.href !== href) {
      setSessionStarted(true)
      await setLocal<TutorSessionState>(STORAGE_KEYS.tutorSession, {
        sessionStarted: true,
        tutorContext,
        tutorMessages,
        tutorQuickActions,
        tutorInput
      })
      location.href = href
      return
    }
    if (!sessionStarted) return setSessionStarted(true)
    if (file && !tutorContext) return createTutorContext()
    return readAndPlan()
  }

  const sendTutorMessage = async (preset?: string) => {
    if (!tutorContext) return
    const studentMessage = (preset ? tutorQuickCommandPrompts[preset] ?? preset : tutorInput).trim()
    if (!studentMessage) return
    setLoading(true)
    setBusyAction("tutor-message")
    setError(undefined)
    try {
      const response: TutorChatResponse = await apiClient.tutorChat({
        materialId: tutorContext.materialId,
        studentContext: snapshot?.studentContext,
        messages: tutorMessages.slice(-6),
        studentMessage
      })
      const tutorContent = [response.answer, response.followUpQuestion].filter(Boolean).join("\n\n")
      setTutorMessages((prev) => [...prev, { role: "student", content: preset ?? studentMessage }, { role: "tutor", content: tutorContent }])
      setTutorQuickActions(tutorQuickCommandLabels)
      setTutorInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось продолжить диалог с AI-репетитором.")
    } finally {
      setLoading(false)
      setBusyAction(null)
    }
  }

  const sendDialogueMessage = async () => {
    if (!practice || !dialogueInput.trim()) return
    const studentMessage = dialogueInput.trim()
    setLoading(true)
    setError(undefined)
    try {
      const response = await apiClient.caseFeedback({ caseData: practice, messages: dialogue, studentMessage })
      const tutorContent = [response.tutorReply, response.nextQuestion].filter(Boolean).join("\n\n")
      setDialogue((prev) => [...prev, { role: "student", content: studentMessage }, { role: "tutor", content: tutorContent }])
      setDialogueInput("")
      setDialogueProgress(response.progress)
      setLastInsight(response.unlockedInsight)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось продолжить диалог.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="lms-board">
      <div className="lms-hero">
        <div>
          <h2>Маршрут недели</h2>
          <p>Ваш персональный план на {formatGoalDateRange(weeklyGoal, today)}</p>
        </div>
        <div className="lms-rhythm" aria-label="Ритм недели">
          <div className="lms-rhythm-head">
            <span><Flame size={15} /> Ритм недели</span>
            <strong>{streakDays} дн. подряд</strong>
          </div>
          <div className="lms-rhythm-days">
            {weekDays.map((day) => {
              const active = learningActivity.activeDates.includes(day.date)
              const todayActive = day.date === formatIsoDate(today)
              return (
                <span className={active ? "is-active" : todayActive ? "is-today" : ""} key={day.date}>
                  <i>{day.label}</i>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <ErrorState message={error} />
      {loading && <ProgressBar />}

      <div className="lms-command-card">
        <div className="lms-command-copy">
          <Sparkles size={24} />
          <div>
            <span>{plan ? "Главное действие" : "Маршрут недели"}</span>
            <h3>{plan && !nextAction ? "План недели выполнен" : plan && nextAction ? (nextPrimaryActivity?.disciplineTitle || nextAction.discipline) : "Соберу недельный маршрут"}</h3>
            <p>{plan && !nextAction ? "На этой неделе все запланированные активности уже закрыты. Можно обновить маршрут или перейти к следующей неделе." : plan && nextAction ? `${nextActionDate}: ${nextPrimaryActivity?.topicTitle || nextAction.topic || "следующая тема"}` : "Одна кнопка считает прогресс LMS, строит маршрут на семестр и показывает текущую неделю."}</p>
          </div>
        </div>
        <Button className="ai-primary-cta" disabled={!enabled || loading} onClick={runPrimary}>
          {nextLabel}
          <ArrowRight size={17} />
        </Button>
      </div>

      {!plan && (
        <div className="lms-start">
          <h3>Что произойдет после запуска</h3>
          <p>Расширение прочитает дисциплины, темы и занятия LMS, соберет план до конца семестра и покажет нагрузку текущей недели.</p>
        </div>
      )}

      {plan && (
        <>
        <div className="lms-week-strip">
          {weekDays.map((day) => {
            const entries = weekItemsByDate.get(day.date) ?? []
            const completedCount = entries.filter((entry) => entry.completed).length
            const plannedHours = entries.reduce((sum, entry) => sum + (entry.completed ? 0 : parseHours(entry.item.time)), 0)
            const isToday = day.date === formatIsoDate(today)
            return (
              <div className={isToday ? "lms-week-day is-today" : "lms-week-day"} key={day.date}>
                <span>{day.label}</span>
                <strong>{day.day}</strong>
                <em>{entries.length ? formatHours(plannedHours) : "—"}</em>
                <small>{entries.length ? `${completedCount}/${entries.length}` : "нет"}</small>
              </div>
            )
          })}
        </div>

        <div className="lms-layout">
          <div className="lms-route">
            {weekItems.map((item, index) => {
              const { discipline, topic } = splitAction(item.action)
              const date = asDate(item.date)
              const isToday = formatIsoDate(date) === formatIsoDate(today)
              const completed = isPlannedItemCompleted(item, completedTopicKeys)
              const completion = completionLog[plannedItemKey(item)]
              const isRescheduled = !completed && /^Перенесено из-за просрочки/i.test(item.practiceRecommendation || "")
              const isNext = !completed && nextItemKey === itemKey(item)
              return (
                <div className="lms-route-row" key={`${item.date}-${item.action}`}>
                  <div className={completed ? "lms-day is-completed" : isNext ? "lms-day is-active" : "lms-day"}>
                    <strong>{date.getDate()}</strong>
                    <span>{date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")}</span>
                  </div>
                  <div className={completed ? "lms-lesson is-completed" : isNext ? "lms-lesson is-active" : "lms-lesson"}>
                    <div className="lms-lesson-top">
                      {completed && <span className="lms-chip is-completed">Пройдено</span>}
                      {isRescheduled && <span className="lms-chip">Перенесено</span>}
                      {!completed && isToday && <span className="lms-chip">Сегодня</span>}
                      {!isToday && isNext && <span className="lms-chip">Следующий шаг</span>}
                      <em>{item.time}</em>
                    </div>
                    <h3>{discipline || item.action}</h3>
                    {item.activities?.length ? (
                      <div className="lms-activity-list">
                        {item.activities.map((activity, activityIndex) => (
                          <div key={`${activity.disciplineTitle}-${activity.topicTitle}-${activity.activityTitle || activityIndex}`}>
                            <strong>{activity.disciplineTitle}</strong>
                            <span>{activity.topicTitle}</span>
                            {activity.activityTitle && <small>{activity.activityTitle}</small>}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {item.practiceRecommendation && <p className="lms-practice-tip">{item.practiceRecommendation}</p>}
                    {completion?.note && <p className="lms-practice-tip">{completion.note}</p>}
                    <small>{completed && completion ? `Пройдено ${formatDate(completion.completedAt)}` : weekday(item.date)}</small>
                  </div>
                </div>
              )
            })}
          </div>

          <aside className="lms-side">
            <div className="lms-recalculate-card">
              <Button variant="secondary" disabled={!enabled || loading} onClick={readAndPlan}>
                <RefreshCw size={15} /> {busyAction === "route" ? "Обновляем маршрут..." : "Обновить маршрут недели"}
              </Button>
              {busyAction === "route" && <ProgressBar />}
            </div>

          </aside>
        </div>
        </>
      )}

      {plan && (
        <details className="ai-disclosure lms-tools" open={sessionStarted}>
          <summary><span>AI репетитор</span><ChevronDown size={16} /></summary>
          <FileUpload file={file} onFile={(nextFile) => {
            setFile(nextFile)
            setTestPrep(null)
            setPractice(null)
            setTutorContext(null)
            setTutorMessages([])
            setTutorQuickActions([])
            setTutorInput("")
            setDialogue([])
            setLastInsight(undefined)
          }} />
          {!tutorContext && (
            <Button className="ai-primary-cta" disabled={!enabled || !file || loading} onClick={createTutorContext}>
              <Sparkles size={16} /> {busyAction === "tutor-start" ? "Запускаем AI-репетитора..." : "Запустить AI-репетитора"}
            </Button>
          )}
          {busyAction === "tutor-start" && <ProgressBar />}
          {tutorContext && (
            <div className="ai-tutor-chat-panel">
              <div className="ai-quick-actions">
                {tutorQuickActions.map((action) => (
                  <button disabled={loading} key={action} type="button" onClick={() => sendTutorMessage(action)}>{action}</button>
                ))}
              </div>
              <div className="ai-chat">
                {tutorMessages.map((message, index) => (
                  <div className={message.role === "student" ? "ai-chat-bubble is-student" : "ai-chat-bubble"} key={`${message.role}-${index}`}>
                    <ChatMessageContent content={message.content} onSubmitPractice={message.role === "tutor" ? sendTutorMessage : undefined} />
                  </div>
                ))}
              </div>
              <div className="ai-tutor-input-row">
                <TextArea placeholder="Спросите по материалу: термин, пример, суть темы..." value={tutorInput} onChange={(event) => setTutorInput(event.target.value)} />
                <Button disabled={loading || !tutorInput.trim()} onClick={() => sendTutorMessage()}><Send size={15} /> {busyAction === "tutor-message" ? "AI готовит ответ..." : "Отправить вопрос"}</Button>
                {busyAction === "tutor-message" && <ProgressBar />}
              </div>
            </div>
          )}
        </details>
      )}

      {testPrep && (
        <div className="lms-content-card">
          <h3>AI-конспект материала</h3>
          <p>{testPrep.summary}</p>
          <h4>Суть материала</h4>
          <ul>{testPrep.coreIdeas.map((item) => <li key={item}>{item}</li>)}</ul>
          <h4>Основные понятия</h4>
          <div className="ai-concept-list">
            {testPrep.keyConcepts.map((concept) => (
              <div key={concept.title}><strong>{concept.title}</strong><span>{concept.explanation}</span></div>
            ))}
          </div>
          <h4>Важные инсайты</h4>
          <ul>{testPrep.insights.map((item) => <li key={item}>{item}</li>)}</ul>
          <h4>Где применять</h4>
          <ul>{testPrep.applications.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}

      {practice && (
        <div className="lms-content-card ai-dialogue">
          <div className="ai-dialogue-head">
            <span>{practice.levelName}</span>
            <h3>{practice.gameTitle}</h3>
            <p>{practice.mission}</p>
          </div>
          <div className="ai-sim-block"><strong>Ситуация из жизни</strong><p>{practice.lifeSituation}</p></div>
          <div className="ai-checkpoints">
            <strong>{practice.progressLabel}</strong>
            <div>{practice.thinkingCheckpoints.map((checkpoint, index) => <span className={dialogueProgress && index < dialogueProgress.completedCheckpoints ? "is-done" : ""} key={checkpoint}>{checkpoint}</span>)}</div>
          </div>
          {practice.mentorHint && <p className="ai-sim-hint">{practice.mentorHint}</p>}
          {lastInsight && <p className="ai-unlocked"><strong>Инсайт открыт:</strong> {lastInsight}</p>}
          <div className="ai-chat">
            {dialogue.map((message, index) => (
              <div className={message.role === "student" ? "ai-chat-bubble is-student" : "ai-chat-bubble"} key={`${message.role}-${index}`}>{message.content}</div>
            ))}
          </div>
          {dialogueProgress && <div className="ai-dialogue-progress"><span>{dialogueProgress.stageTitle}</span><strong>{dialogueProgress.completedCheckpoints}/{dialogueProgress.totalCheckpoints}</strong></div>}
          <TextArea placeholder="Ответьте своими словами. Можно коротко." value={dialogueInput} onChange={(event) => setDialogueInput(event.target.value)} />
          <Button disabled={loading || !dialogueInput.trim()} onClick={sendDialogueMessage}>Продолжить диалог</Button>
        </div>
      )}

    </section>
  )
}

