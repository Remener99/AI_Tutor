import type { LmsSnapshot } from "@ai-tutor/shared"
import { collectLmsSnapshotFromDom } from "./domSnapshot"

const fallbackSnapshot = (): LmsSnapshot => ({
  source: "synergy_lms",
  capturedAt: new Date().toISOString(),
  pageUrl: "https://lms.synergy.ru/student/up",
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

export const readCurrentProgress = async (): Promise<LmsSnapshot> => {
  if (typeof chrome === "undefined") return fallbackSnapshot()
  if (!chrome.tabs && typeof document !== "undefined") return collectLmsSnapshotFromDom()
  if (!chrome.tabs) return fallbackSnapshot()

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return fallbackSnapshot()

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectLmsSnapshotFromDom
  })

  return (result ?? fallbackSnapshot()) as LmsSnapshot
}
