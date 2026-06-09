import type { LmsSnapshot } from "@ai-tutor/shared"
import { countThemeProgress } from "./progress"

const fallbackSnapshot = (): LmsSnapshot => ({
  source: "synergy_lms",
  capturedAt: new Date().toISOString(),
  pageUrl: location.href,
  isSupportedPage: false,
  isForbiddenTestPage: false,
  studentContext: {
    specialty: "Не определено",
    course: "Не определено",
    educationLevel: "бакалавриат"
  },
  disciplines: [],
  progress: {
    totalDisciplines: 0,
    completedDisciplines: 0,
    totalTopics: 0,
    completedTopics: 0,
    percent: 0,
    sessionStartDate: new Date(new Date().getFullYear(), 1, 1).toISOString().slice(0, 10),
    sessionEndDate: new Date(new Date().getFullYear(), 5, 30).toISOString().slice(0, 10)
  }
})

type ParsedTopic = {
  id: string
  title: string
  kind?: "learning_material" | "self_check_test" | "final_assessment" | "final_test" | "competency_test" | "other"
  topicTitle?: string
  activityTitle?: string
  parentTopicTitle?: string
  status: "not_started" | "in_progress" | "completed"
  estimatedComplexity: "low" | "medium" | "high"
  accessStatus: string
}

type ParsedLearningItem = {
  title: string
  kind?: ParsedTopic["kind"]
  topicTitle?: string
  activityTitle?: string
  parentTopicTitle?: string
}

const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim()
const getText = (el: Element | null) => normalize((el as HTMLElement | null)?.innerText || el?.textContent || "")
const PROFILE_LABELS = {
  direction: "\u041d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435",
  profile: "\u041f\u0440\u043e\u0444\u0438\u043b\u044c",
  level: "\u0423\u0440\u043e\u0432\u0435\u043d\u044c",
  semester: "\u0421\u0435\u043c\u0435\u0441\u0442\u0440"
}

const safeUrl = (href: string | null, baseUrl = location.href) => {
  if (!href) return null
  try {
    const url = new URL(href, baseUrl)
    return url.hostname.endsWith("synergy.ru") ? url.href : null
  } catch {
    return null
  }
}

const parseRuDate = (value: string) => {
  const numeric = normalize(value).match(/(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/)
  if (!numeric) return null
  const [, day, month, year] = numeric
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

const fetchSemesterDates = async () => {
  const now = new Date()
  const fallback = now.getMonth() < 7
    ? { start: `${now.getFullYear()}-02-01`, end: `${now.getFullYear()}-06-30` }
    : { start: `${now.getFullYear()}-09-01`, end: `${now.getFullYear()}-12-31` }

  try {
    const response = await fetch("https://lms.synergy.ru/students/calend", { credentials: "include", redirect: "follow" })
    if (!response.ok) return fallback
    const doc = new DOMParser().parseFromString(await response.text(), "text/html")
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00`).getTime()
    const rows = Array.from(doc.querySelectorAll("tr"))
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td, th")).map(getText)
        const dates = cells.map(parseRuDate).filter(Boolean) as string[]
        return { start: dates[0], end: dates[1], type: cells[cells.length - 1] || "" }
      })
      .filter((row) => row.start && row.end && /теоретическое\s+обучение/i.test(row.type))
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))

    const current = rows.find((row) => {
      const start = new Date(`${row.start}T00:00:00`).getTime()
      const end = new Date(`${row.end}T23:59:59`).getTime()
      return start <= today && today <= end
    })
    const selected = current || rows.find((row) => row.start?.startsWith(String(now.getFullYear()))) || rows[0]
    return selected?.start && selected.end ? { start: selected.start, end: selected.end } : fallback
  } catch {
    return fallback
  }
}

const parseProfileTable = (doc: Document) => {
  const rows = Array.from(doc.querySelectorAll("table.table-list tr"))
  const values = new Map<string, string>()

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td")).map(getText)
    if (cells.length < 2) continue
    const label = normalize(cells[0].replace(/[:：]/g, "").replace(/\s+/g, " "))
    const value = normalize(cells.slice(1).join(" "))
    if (label && value) values.set(label.toLowerCase(), value)
  }

  const findProfileValue = (label: string) => values.get(normalize(label).toLowerCase())
  const direction = findProfileValue(PROFILE_LABELS.direction)
  const profile = findProfileValue(PROFILE_LABELS.profile)
  const level = findProfileValue(PROFILE_LABELS.level)
  const semester = findProfileValue(PROFILE_LABELS.semester)

  return {
    specialty: [direction, profile].filter(Boolean).join(" / ") || undefined,
    studyDirection: direction,
    studyProfile: profile,
    educationLevel: level,
    course: semester ? `${semester} семестр` : undefined
  }
}

const fetchStudentProfile = async () => {
  try {
    const response = await fetch("https://lms.synergy.ru/user/profile", { credentials: "include", redirect: "follow" })
    if (!response.ok) return {}
    const doc = new DOMParser().parseFromString(await response.text(), "text/html")
    return parseProfileTable(doc)
  } catch {
    return {}
  }
}

const fetchStudentPlanDocument = async () => {
  try {
    const response = await fetch("https://lms.synergy.ru/student/up", { credentials: "include", redirect: "follow" })
    if (!response.ok) return null
    return new DOMParser().parseFromString(await response.text(), "text/html")
  } catch {
    return null
  }
}

const cleanTopicTitle = (value: string) => {
  let text = normalize(value)
    .replace(/^[A-ZА-Я]\d+(?:\.\d+)?\s+/i, "")
    .replace(/^(Тема\s+\d+)\s+Тема\s+\d+/i, "$1")

  for (const pattern of [
    /\s+Учебные материалы\b/i,
    /\s+Занятие\s+\d+/i,
    /\s+Конспект\s+\d+/i,
    /\s+Глоссарий\s+\d+/i,
    /\s+Тест для самопроверки/i,
    /\s+Итоговый тест/i,
    /\s+Анкета с обратной связью/i,
    /\s+Оцените пройденный материал/i
  ]) {
    const match = text.match(pattern)
    if (match?.index && match.index > 0) text = text.slice(0, match.index)
  }

  if (/^И\s+Итоговая аттестация/i.test(text)) return "Итоговая аттестация"
  if (/^ОС\s+Обратная связь/i.test(text)) return "Обратная связь"
  return normalize(text)
}

const readActivityTitle = (sourceElement: Element) => {
  const spans = Array.from(sourceElement.querySelectorAll("span")).map(getText).filter(Boolean)
  const activity = spans.find((text) => /занятие|конспект|глоссарий|тест/i.test(text)) || spans[spans.length - 1]
  const code = spans.find((text) => /^[А-ЯA-Z]+\d+(?:\.\d+)?$/i.test(text))
  const source = normalize(activity || getText(sourceElement))

  if (/итоговая\s+аттестация/i.test(source)) return { topicTitle: "Итоговая аттестация", activityTitle: "Итоговая аттестация", kind: "final_assessment" as const }

  const numeric = source.match(/(\d+)(?:\.(\d+))?/) || code?.match(/(\d+)(?:\.(\d+))?/)
  const topicTitle = numeric ? `Тема ${numeric[1]}` : "Тема"
  const activityTitle = source || code || topicTitle
  const kind: ParsedTopic["kind"] = /тест/i.test(activityTitle)
    ? "self_check_test"
    : /занятие|конспект|глоссарий/i.test(activityTitle)
      ? "learning_material"
      : "other"
  return { topicTitle, activityTitle, kind }
}

const buildLearningItem = (sourceElement: Element) => {
  const { topicTitle, activityTitle, kind } = readActivityTitle(sourceElement)
  if (isFinalAssessmentTitle(activityTitle)) {
    return {
      title: "Итоговая аттестация",
      kind: "final_assessment" as const,
      topicTitle: "Итоговая аттестация",
      activityTitle: "Итоговая аттестация",
      parentTopicTitle: undefined
    }
  }
  return {
    title: normalize(`${topicTitle} — ${activityTitle}`),
    kind,
    topicTitle,
    activityTitle,
    parentTopicTitle: topicTitle
  }
}

export const isFinalAssessmentTitle = (title: string) => /итоговая\s+аттестация/i.test(title)

export const ensureFinalAssessment = (topics: ParsedTopic[], disciplineId: string, disciplineCompleted: boolean) => {
  const regularTopics = topics.filter((topic) => !isFinalAssessmentTitle(topic.title))
  const allRegularTopicsCompleted = regularTopics.length > 0 && regularTopics.every((topic) => topic.status === "completed")
  const existingFinalAssessment = topics.find((topic) => isFinalAssessmentTitle(topic.title))

  if (!disciplineCompleted && !allRegularTopicsCompleted) return regularTopics
  if (existingFinalAssessment) {
    return [
      ...regularTopics,
      {
        ...existingFinalAssessment,
        status: disciplineCompleted ? "completed" as const : "not_started" as const
      }
    ]
  }

  return [
    ...regularTopics,
    {
      id: `${disciplineId}-final-assessment`,
      title: "Итоговая аттестация",
      kind: "final_assessment" as const,
      topicTitle: "Итоговая аттестация",
      activityTitle: "Итоговая аттестация",
      status: disciplineCompleted ? "completed" as const : "not_started" as const,
      estimatedComplexity: "high" as const,
      accessStatus: disciplineCompleted ? "completed" : "final_required"
    }
  ]
}

export const resolveLmsTopicStatus = ({
  disciplineCompleted,
  title,
  html,
  hasLinks,
  index
}: {
  disciplineCompleted: boolean
  title: string
  html: string
  hasLinks: boolean
  index: number
}): { status: ParsedTopic["status"]; accessStatus: string } => {
  const normalizedHtml = html.toLowerCase()
  const completedByMarker = /sidebar__icon--success|completed|done|passed|success|пройден|заверш|выполнен/i.test(normalizedHtml)
  const emptyMarker = /sidebar__icon--empty/i.test(normalizedHtml)
  const activeMarker = /sidebar__icon--active/i.test(normalizedHtml) && !/sidebar__icon--active[^>]*display:\s*none/i.test(normalizedHtml)
  const accessStatus = hasLinks
    ? "available"
    : /lock|locked|замок|disabled/i.test(normalizedHtml) || index > 0
      ? "locked"
      : "not_loaded"
  const status = disciplineCompleted
    ? "completed"
    : isFinalAssessmentTitle(title)
      ? "not_started"
      : completedByMarker
        ? "completed"
      : activeMarker
        ? "in_progress"
      : emptyMarker
        ? "not_started"
      : accessStatus === "available"
        ? "not_started"
      : accessStatus === "not_loaded"
        ? "in_progress"
        : "not_started"
  return { status, accessStatus }
}

export const buildParsedTopic = ({
  disciplineId,
  disciplineTitle,
  index,
  learningItem,
  html,
  hasLinks,
  disciplineCompleted
}: {
  disciplineId: string
  disciplineTitle: string
  index: number
  learningItem: ParsedLearningItem
  html: string
  hasLinks: boolean
  disciplineCompleted: boolean
}): ParsedTopic | null => {
  const title = learningItem.title
  if (!title || /^учебные материалы$/i.test(title)) return null
  const { status, accessStatus } = resolveLmsTopicStatus({
    disciplineCompleted,
    title,
    html,
    hasLinks,
    index
  })
  return {
    id: `${disciplineId}-topic-${index + 1}`,
    title,
    kind: learningItem.kind,
    topicTitle: learningItem.topicTitle,
    activityTitle: learningItem.activityTitle,
    parentTopicTitle: learningItem.parentTopicTitle,
    status,
    estimatedComplexity: complexityByTitle(`${disciplineTitle} ${title}`),
    accessStatus
  }
}

const decodeHtmlEntities = (value: string) => value
  .replace(/&quot;/g, "\"")
  .replace(/&#34;/g, "\"")
  .replace(/&apos;/g, "'")
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, "&")

export const readLmsRowFieldFromHtml = (html: string, field: "currentScore" | "finalGrade") => {
  const source = decodeHtmlEntities(html)
  const kebab = field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  const lower = field.toLowerCase()
  const patterns = [
    new RegExp(`["']${field}["']\\s*:\\s*["']([^"']*)["']`, "i"),
    new RegExp(`["']${field}["']\\s*:\\s*([0-9]+(?:[.,][0-9]+)?)`, "i"),
    new RegExp(`${field}\\s*[:=]\\s*["']([^"']*)["']`, "i"),
    new RegExp(`${field}\\s*[:=]\\s*([0-9]+(?:[.,][0-9]+)?)`, "i"),
    new RegExp(`${lower}\\s*[:=]\\s*["']([^"']*)["']`, "i"),
    new RegExp(`${lower}\\s*[:=]\\s*([0-9]+(?:[.,][0-9]+)?)`, "i"),
    new RegExp(`data-${kebab}=["']([^"']*)["']`, "i"),
    new RegExp(`${kebab}=["']([^"']*)["']`, "i")
  ]
  for (const pattern of patterns) {
    const value = normalize(source.match(pattern)?.[1])
    if (value) return value
  }
  return ""
}

export const readVisibleScoreFromText = (text: string) =>
  normalize(text.match(/(\d{1,3})\s*(?:из|\/)\s*100/i)?.[1])

export const readVisibleFinalGradeFromText = (text: string) => {
  const normalized = normalize(text)
  const quoted = normalized.match(/[«"]\s*([^»"]{2,40})\s*[»"]/i)?.[1]
  if (quoted) return normalize(quoted)
  const grade = normalized.match(/\b(отлично|хорошо|удовлетворительно|зачтено|неудовлетворительно)\b/i)?.[1]
  return normalize(grade)
}

const complexityByTitle = (title: string): "low" | "medium" | "high" => {
  const lower = title.toLowerCase()
  if (/финанс|эконом|математ|программ|python|машин|искусственн|оптимальн|риск|инвест|проект/i.test(lower)) return "high"
  if (/обратная связь|анкета|глоссарий/i.test(lower)) return "low"
  return "medium"
}

const getOwnResourceLink = (li: Element) =>
  Array.from(li.querySelectorAll(":scope > a[href], :scope > div > a[href]"))
    .find((link) => link.getAttribute("data-type") || link.getAttribute("data-resource-id") || link.getAttribute("data-item-id"))

const parseCourseDocument = (doc: Document, pageUrl: string, disciplineId: string, disciplineTitle: string, disciplineCompleted = false) => {
  const sidebar = doc.querySelector(".materials .materials__container ul.sidebar")
  if (!sidebar) return []

  const resourceItems: Array<{ li: Element; link: Element }> = []
  for (const li of Array.from(sidebar.querySelectorAll("li"))) {
    const link = getOwnResourceLink(li)
    if (link) resourceItems.push({ li, link })
  }

  return resourceItems
    .map((li, index): ParsedTopic | null => {
      const learningItem = buildLearningItem(li.link)
      const links = [safeUrl(li.link.getAttribute("href"), pageUrl)].filter(Boolean)
      const html = `${li.li.outerHTML} ${li.link.outerHTML}`.toLowerCase()
      return buildParsedTopic({ disciplineId, disciplineTitle, index, learningItem, html, hasLinks: links.length > 0, disciplineCompleted })
    })
    .filter(Boolean) as ParsedTopic[]
}

const parseDisciplineRows = (doc: Document = document, baseUrl = location.href) => {
  const table = doc.querySelector("table.table-list.student-up-table")
  if (!table) return []
  const semesters = Array.from(table.querySelectorAll("tbody.semester")).map((tbody) => ({
    isCurrent: /текущий/i.test(getText(tbody.querySelector("tr.semtab"))) || tbody.classList.contains("expanded"),
    rows: Array.from(tbody.querySelectorAll("tr.discipl"))
  }))
  const rows = (semesters.find((semester) => semester.isCurrent) || semesters[0])?.rows || []

  const readRowField = (row: Element, field: "currentScore" | "finalGrade") => {
    const kebab = field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    const selectors = [
      `[name="${field}"]`,
      `[data-field="${field}"]`,
      `[data-name="${field}"]`,
      `[data-${kebab}]`,
      `.${field}`,
      `.${kebab}`
    ]
    const element = row.querySelector(selectors.join(", "))
    const elementValue = element
      ? normalize(
        (element as HTMLInputElement).value ||
        element.getAttribute("value") ||
        element.getAttribute("data-value") ||
        element.getAttribute(`data-${kebab}`) ||
        getText(element)
      )
      : ""
    if (elementValue) return elementValue

    const rowValue = normalize(
      row.getAttribute(field) ||
      row.getAttribute(field.toLowerCase()) ||
      row.getAttribute(`data-${kebab}`) ||
      row.getAttribute(`data-${field.toLowerCase()}`)
    )
    if (rowValue) return rowValue

    return readLmsRowFieldFromHtml(row.outerHTML, field)
  }

  return rows.map((row, index) => {
    const rowText = getText(row)
    const links = Array.from(row.querySelectorAll("a[href]"))
      .map((a) => ({ text: getText(a), href: safeUrl(a.getAttribute("href"), baseUrl) }))
      .filter((item) => item.text && item.href)
    const titleLink = links[0]
    const title = titleLink?.text || Array.from(row.querySelectorAll("td")).map(getText).find((cell) => cell && !/^\d+$/.test(cell)) || ""
    if (!title || /элективные дисциплины/i.test(rowText)) return null
    const currentScore = readRowField(row, "currentScore") || readVisibleScoreFromText(rowText)
    const finalGrade = readRowField(row, "finalGrade") || readVisibleFinalGradeFromText(rowText)
    const score = currentScore || readVisibleScoreFromText(rowText)
    const disciplineSubmitted = Boolean(currentScore && finalGrade)
    return {
      id: `discipline-${index + 1}`,
      title,
      href: titleLink?.href || null,
      currentScore,
      finalGrade,
      completed: disciplineSubmitted,
      score: score ? Number(score) : null
    }
  }).filter(Boolean) as Array<{ id: string; title: string; href: string | null; currentScore: string; finalGrade: string; completed: boolean; score: number | null }>
}

const inferContext = (profile: Partial<ReturnType<typeof parseProfileTable>> = {}) => {
  const group = getText(document.querySelector("#switch-accounts .title"))
  return {
    specialty: profile.specialty || group || "Не определено",
    course: profile.course || (group.match(/(\d)\s*курс/i)?.[1] ? `${group.match(/(\d)\s*курс/i)?.[1]} курс` : "Не определено"),
    educationLevel: profile.educationLevel || "бакалавриат",
    studyDirection: profile.studyDirection,
    studyProfile: profile.studyProfile,
    currentDisciplineTitle: getText(document.querySelector("#content h1, .content h1, h1")) || undefined,
    currentTopicTitle: getText(document.querySelector("h2, .topic-title")) || undefined
  }
}

export const collectLmsSnapshotFromDom = async (): Promise<LmsSnapshot> => {
  const forbidden = /\/assessments|итоговый тест|компетентностный тест|экзаменационный тест|контрольный тест|final-test|exam|testattempt/i
    .test(`${location.href} ${document.body?.innerText || ""}`)
  const [semesterDates, studentProfile] = await Promise.all([fetchSemesterDates(), fetchStudentProfile()])
  const isDisciplinePage = Boolean(document.querySelector(".materials .materials__container ul.sidebar"))
  const isPlanPage = Boolean(document.querySelector("table.table-list.student-up-table"))
  const planDocument = isPlanPage ? document : await fetchStudentPlanDocument()
  const subjects = parseDisciplineRows(planDocument ?? document, planDocument ? "https://lms.synergy.ru/student/up" : location.href)
  const disciplines = []

  if (subjects.length) {
    for (const subject of subjects) {
      let topics: ParsedTopic[] = []
      if (subject.href) {
        try {
          const response = await fetch(subject.href, { credentials: "include", redirect: "follow" })
          if (response.ok) {
            const doc = new DOMParser().parseFromString(await response.text(), "text/html")
            topics = parseCourseDocument(doc, response.url || subject.href, subject.id, subject.title, subject.completed)
          }
        } catch {
          topics = []
        }
      }
      const normalizedTopics = ensureFinalAssessment(topics, subject.id, subject.completed)
      disciplines.push({
        id: subject.id,
        title: subject.title,
        href: subject.href,
        currentScore: subject.currentScore,
        finalGrade: subject.finalGrade,
        status: subject.completed ? "completed" as const : "in_progress" as const,
        deadline: semesterDates.end,
        topics: normalizedTopics.map(({ accessStatus: _accessStatus, ...topic }) => topic)
      })
    }
  } else if (isDisciplinePage) {
    const title = getText(document.querySelector("#content h1, .content h1, h1")) || document.title || "Текущая дисциплина"
    const topics = ensureFinalAssessment(parseCourseDocument(document, location.href, "current-discipline", title), "current-discipline", false)
    disciplines.push({
      id: "current-discipline",
      title,
      href: location.href,
      status: "in_progress" as const,
      deadline: semesterDates.end,
      topics: topics.map(({ accessStatus: _accessStatus, ...topic }) => topic)
    })
  }

  const themeProgress = countThemeProgress(disciplines)
  const completedDisciplines = disciplines.filter((discipline) => discipline.status === "completed").length

  return {
    ...fallbackSnapshot(),
    capturedAt: new Date().toISOString(),
    pageUrl: location.href,
    isSupportedPage: disciplines.length > 0 && !forbidden,
    isForbiddenTestPage: forbidden,
    studentContext: inferContext(studentProfile),
    disciplines,
    semesterContext: {
      source: "synergy_lms_dom_extractor",
      extractedAt: new Date().toISOString(),
      page: {
        title: document.title,
        url: location.href
      },
      currentSemester: {
        startDate: semesterDates.start,
        endDate: semesterDates.end,
        pageKind: isPlanPage ? "plan" : isDisciplinePage ? "discipline" : "other"
      },
      summary: {
        subjectsCount: disciplines.length,
        sectionsCount: themeProgress.totalTopics,
        completedSectionsCount: themeProgress.completedTopics,
        remainingSectionsCount: themeProgress.remainingTopics,
        finalAssessmentsCount: themeProgress.totalFinalAssessments,
        completedFinalAssessmentsCount: themeProgress.completedFinalAssessments,
        remainingFinalAssessmentsCount: themeProgress.remainingFinalAssessments
      }
    },
    progress: {
      totalDisciplines: disciplines.length,
      completedDisciplines,
      totalTopics: themeProgress.totalTopics,
      completedTopics: themeProgress.completedTopics,
      percent: themeProgress.percent,
      sessionStartDate: semesterDates.start,
      sessionEndDate: semesterDates.end
    }
  }
}
