import type { Discipline, LmsSnapshot, StudentContext, Topic } from "@ai-tutor/shared"
import { anonymizeText } from "./anonymize"
import { isSupportedLmsPage, isSynergyLms } from "./lmsDetector"
import { countThemeProgress } from "./progress"
import { detectForbiddenTestPage } from "./testPageGuard"

const text = (selector: string) => document.querySelector(selector)?.textContent?.trim()

const inferStudentContext = (): StudentContext => ({
  specialty: anonymizeText(text("[data-specialty], .specialty, .profile-specialty") ?? "Не определено"),
  course: anonymizeText(text("[data-course], .course, .profile-course") ?? "Не определено"),
  educationLevel: anonymizeText(text("[data-education-level], .education-level") ?? "бакалавриат"),
  currentDisciplineTitle: anonymizeText(text("h1, .course-title, [data-discipline-title]") ?? "Текущая дисциплина"),
  currentTopicTitle: anonymizeText(text("h2, .topic-title, [data-topic-title]") ?? "Текущая тема")
})

const parseTopics = (root: Element): Topic[] => {
  const nodes = Array.from(root.querySelectorAll("[data-topic], .topic, .lesson, li")).slice(0, 20)
  return nodes.map((node, index) => {
    const raw = anonymizeText(node.textContent?.trim().replace(/\s+/g, " ") || `Тема ${index + 1}`)
    const lower = raw.toLowerCase()
    const status = lower.includes("пройден") || lower.includes("заверш") ? "completed" : lower.includes("начат") ? "in_progress" : "not_started"
    return { id: `topic-${index + 1}`, title: raw.slice(0, 90), status }
  })
}

export const parseLmsSnapshot = (): LmsSnapshot => {
  const bodyText = document.body?.innerText ?? ""
  const isForbiddenTestPage = detectForbiddenTestPage(location.href, bodyText)
  const isSupportedPage = isSynergyLms(location.href) && isSupportedLmsPage(bodyText) && !isForbiddenTestPage
  const disciplineNodes = Array.from(document.querySelectorAll("[data-discipline], .discipline, .course-card")).slice(0, 8)
  const disciplines: Discipline[] = (disciplineNodes.length ? disciplineNodes : [document.body]).map((node, index) => {
    const title = anonymizeText(node.querySelector("h1,h2,h3,.title")?.textContent?.trim() || inferStudentContext().currentDisciplineTitle || `Дисциплина ${index + 1}`)
    const topics = parseTopics(node)
    const completed = topics.length > 0 && topics.every((topic) => topic.status === "completed")
    return {
      id: `discipline-${index + 1}`,
      title: title.slice(0, 90),
      status: completed ? "completed" : "in_progress",
      deadline: text("[data-deadline], .deadline") || undefined,
      topics: topics.length ? topics : [
        { id: "topic-1", title: inferStudentContext().currentTopicTitle || "Тема", status: "in_progress", estimatedComplexity: "medium" }
      ]
    }
  })
  const themeProgress = countThemeProgress(disciplines)

  return {
    source: "synergy_lms",
    capturedAt: new Date().toISOString(),
    pageUrl: location.href,
    isSupportedPage,
    isForbiddenTestPage,
    studentContext: inferStudentContext(),
    disciplines,
    progress: {
      totalDisciplines: disciplines.length,
      completedDisciplines: disciplines.filter((discipline) => discipline.status === "completed").length,
      totalTopics: themeProgress.totalTopics,
      completedTopics: themeProgress.completedTopics,
      percent: themeProgress.percent,
      sessionEndDate: text("[data-session-end], .session-end") || undefined
    }
  }
}
