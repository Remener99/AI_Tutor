import type { GeneratePlanRequest, GeneratePlanResponse, StudentState } from "@ai-tutor/shared"

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

const formatPlanDate = (date: string) => formatRuDate(new Date(`${date}T12:00:00`))

const formatHours = (hours: number) => {
  const minutes = Math.max(15, Math.round((hours * 60) / 15) * 15)
  if (minutes < 60) return `${minutes} мин`
  if (minutes === 60) return "1 ч"
  const value = minutes / 60
  return `${Number(value.toFixed(2)).toString().replace(".", ",")} ч`
}

const actionTitle = (item: StudentState["remainingItems"][number]) => {
  const topic = item.activityTitle && !item.topicTitle.toLowerCase().includes(item.activityTitle.toLowerCase())
    ? `${item.topicTitle} — ${item.activityTitle}`
    : item.topicTitle
  return `${item.disciplineTitle} — ${topic}`
}

const describeDailyAction = (items: StudentState["remainingItems"]) => {
  if (items.length === 1) return actionTitle(items[0])
  const disciplines = [...new Set(items.map((item) => item.disciplineTitle))]
  const topics = items.map((item) => item.activityTitle || item.topicTitle)
  if (disciplines.length === 1) return `${disciplines[0]} — ${topics.slice(0, 2).join("; ")}${topics.length > 2 ? ` и еще ${topics.length - 2}` : ""}`
  return `${disciplines.length} дисциплины — ${items.length} учебных шага`
}

const buildPracticeRecommendation = (items: StudentState["remainingItems"]) => {
  const item = items[0]
  const topic = item.activityTitle || item.topicTitle
  const discipline = item.disciplineTitle
  const context = `${discipline} ${topic}`

  if (items.length > 1) {
    return `В конце дня коротко свяжите ${items.length} шага между собой: выпишите по одному выводу из каждого занятия и один вопрос для самопроверки.`
  }

  if (item.itemKind === "final_assessment") {
    return `Перед итоговой аттестацией по дисциплине «${discipline}» соберите 5 тезисов из закрытых тем и проверьте, можете ли объяснить каждый тезис на простом практическом примере.`
  }

  if (/финанс|бюджет|инвест|проект/i.test(context)) {
    return `Разберите тему «${topic}» на мини-кейсе: представьте учебный проект и запишите, какое решение по деньгам, рискам или поддержке помогает принять этот материал.`
  }

  if (/риск|прав|PR|коммуникац|управлен/i.test(context)) {
    return `После занятия «${topic}» опишите одну реальную ситуацию, где ошибка в коммуникации, правилах или управлении меняет результат, и привяжите ее к термину из темы.`
  }

  return `После занятия «${topic}» сформулируйте один бытовой или рабочий пример применения темы и один вопрос, который проверяет, поняли ли вы смысл материала.`
}

const distributeDates = (state: StudentState) => {
  const allowedDays = state.preferences.availableDays
    .map((day) => weekdayIndex[day])
    .filter((day) => day !== undefined)
  const selectedDays = allowedDays.length ? allowedDays : [1, 2, 3, 4, 5]
  const start = new Date(`${state.semester.currentDate}T12:00:00`)
  const end = state.semester.endDate
    ? new Date(`${state.semester.endDate}T12:00:00`)
    : new Date(start.getTime() + 45 * 86_400_000)
  const dates: string[] = []
  let cursor = new Date(start)

  while (cursor <= end) {
    if (selectedDays.includes(cursor.getDay())) dates.push(formatDate(cursor))
    cursor = new Date(cursor.getTime() + 86_400_000)
  }

  return dates.length ? dates : [formatDate(start)]
}

const orderItems = (state: StudentState) => {
  const complexityWeight = { high: 0, medium: 1, low: 2 } as const
  const isFinal = (item: typeof state.remainingItems[number]) => /итоговая\s+аттестация/i.test(item.topicTitle)
  const sortByLearningValue = (items: typeof state.remainingItems) => [...items].sort((left, right) => {
    const leftFinal = isFinal(left)
    const rightFinal = isFinal(right)
    if (leftFinal !== rightFinal) return leftFinal ? 1 : -1
    const complexityDiff = complexityWeight[left.complexity] - complexityWeight[right.complexity]
    if (complexityDiff !== 0) return complexityDiff
    return left.disciplineTitle.localeCompare(right.disciplineTitle, "ru")
  })

  const groups = new Map<string, typeof state.remainingItems>()
  for (const item of sortByLearningValue(state.remainingItems)) {
    groups.set(item.disciplineId, [...(groups.get(item.disciplineId) || []), item])
  }
  const result: typeof state.remainingItems = []
  while (result.length < state.remainingItems.length) {
    const orderedGroups = [...groups.entries()]
      .filter(([, items]) => items.length > 0)
      .sort((left, right) => {
        const leftItem = left[1][0]
        const rightItem = right[1][0]
        return complexityWeight[leftItem.complexity] - complexityWeight[rightItem.complexity]
      })
    for (const [key] of orderedGroups) {
      const next = groups.get(key)?.shift()
      if (next) result.push(next)
    }
  }
  return result
}

const buildDailyBuckets = (state: StudentState) => {
  const ordered = orderItems(state)
  const dates = distributeDates(state)
  const selectedDayCount = Math.max(state.preferences.availableDays.length, 1)
  const dailyBudget = Math.max(0.5, state.preferences.hoursPerWeek / selectedDayCount)
  const buckets: Array<{ date: string; items: StudentState["remainingItems"]; hours: number }> = []
  let dateIndex = 0

  for (const item of ordered) {
    let bucket = buckets[buckets.length - 1]
    const shouldStartNewDay = !bucket || (bucket.hours > 0 && bucket.hours + item.estimatedHours > dailyBudget)
    if (shouldStartNewDay) {
      bucket = {
        date: dates[Math.min(dateIndex, dates.length - 1)],
        items: [],
        hours: 0
      }
      buckets.push(bucket)
      dateIndex += 1
    }
    bucket.items.push(item)
    bucket.hours += item.estimatedHours
  }

  return buckets
}

export const buildSmartPlan = (
  request: GeneratePlanRequest,
  state: StudentState,
  sourceAnalysis?: Pick<GeneratePlanResponse, "analysis" | "forecast" | "recommendations">
): GeneratePlanResponse => {
  void request
  const buckets = buildDailyBuckets(state)
  const estimatedTotal = Math.max(state.progress.estimatedHoursRemaining, 0.5)
  const availableTotal = Math.max(state.progress.availableHoursUntilDeadline, 0.5)
  const pressureRatio = availableTotal >= estimatedTotal ? 1 : Math.max(0.35, availableTotal / estimatedTotal)
  const onTrack = availableTotal >= estimatedTotal

  const calendar = buckets.map((bucket) => {
    const adjustedHours = bucket.hours * pressureRatio
    return {
      date: bucket.date,
      action: describeDailyAction(bucket.items),
      time: formatHours(adjustedHours),
      practiceRecommendation: buildPracticeRecommendation(bucket.items),
      activities: bucket.items.map((item) => ({
        disciplineId: item.disciplineId,
        disciplineTitle: item.disciplineTitle,
        topicTitle: item.topicTitle,
        activityTitle: item.activityTitle,
        itemKind: item.itemKind,
        estimatedMinutes: Math.round(item.estimatedHours * 60),
        status: "not_started" as const
      }))
    }
  })

  const first = calendar[0]
  const todayItems = first
    ? [
        ...(first.date === state.semester.currentDate ? [] : [`Ближайшая дата: ${formatPlanDate(first.date)}`]),
        first.action,
        `Потратить ${first.time}`
      ]
    : ["Все темы закрыты"]

  const requiredHoursPerWeek = Math.ceil((estimatedTotal / Math.max(state.semester.daysLeft / 7, 1)) * 10) / 10
  const forecast = sourceAnalysis?.forecast || {
    status: onTrack ? "on_track" as const : "behind" as const,
    text: onTrack
      ? "План покрывает все оставшиеся темы. При текущем графике запас времени достаточный."
      : `План покрывает все оставшиеся темы, но текущего графика мало: нужно около ${requiredHoursPerWeek} ч в неделю.`,
    requiredHoursPerWeek
  }

  const recommendations = sourceAnalysis?.recommendations || [
    onTrack ? "Двигайтесь по календарю сверху вниз: он распределен по дедлайну и доступным дням." : "Увеличьте недельную нагрузку или добавьте еще один учебный день.",
    "Если день пропущен, перенесите его активность на ближайший доступный день и пересоберите план.",
    "Одна активность соответствует одному учебному дню, внутри нее могут быть несколько занятий."
  ]

  const markdown = [
    "## Общий прогноз",
    forecast.text,
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
    `Пройдено тем: ${state.progress.completedTopics} из ${state.progress.totalTopics}. Прогноз: ${forecast.status === "on_track" ? "Успеваешь" : "Нужно ускориться"}.`
  ].filter(Boolean).join("\n")

  return {
    analysis: sourceAnalysis?.analysis,
    forecast,
    calendar,
    today: {
      date: state.semester.currentDate,
      items: todayItems,
      time: first?.time
    },
    progress: {
      daysLeft: state.semester.daysLeft,
      completedTopics: state.progress.completedTopics,
      totalTopics: state.progress.totalTopics,
      forecast: forecast.status
    },
    recommendations,
    markdown
  }
}
