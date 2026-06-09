import { describe, expect, it } from "vitest"
import {
  buildParsedTopic,
  ensureFinalAssessment,
  readLmsRowFieldFromHtml,
  readVisibleFinalGradeFromText,
  readVisibleScoreFromText
} from "../src/content/domSnapshot"
import { countThemeProgress } from "../src/content/progress"

const learningItem = {
  title: "Тема 1 — Занятие 1.1",
  kind: "learning_material" as const,
  topicTitle: "Тема 1",
  activityTitle: "Занятие 1.1",
  parentTopicTitle: "Тема 1"
}

describe("LMS DOM parser rules", () => {
  it("reads currentScore and finalGrade from JSON-like LMS row html", () => {
    const rowHtml = `
      <tr class="discipl" data-model="{&quot;currentScore&quot;:85,&quot;finalGrade&quot;:&quot;отлично&quot;}">
        <td><a href="/course/1">Сданная дисциплина</a></td>
      </tr>
    `

    expect(readLmsRowFieldFromHtml(rowHtml, "currentScore")).toBe("85")
    expect(readLmsRowFieldFromHtml(rowHtml, "finalGrade")).toBe("отлично")
  })

  it("does not treat empty currentScore and finalGrade as submitted", () => {
    const rowHtml = `
      <tr class="discipl" data-model="{&quot;currentScore&quot;:&quot;&quot;,&quot;finalGrade&quot;:&quot;&quot;}">
        <td><a href="/course/1">Несданная дисциплина</a></td>
      </tr>
    `

    expect(readLmsRowFieldFromHtml(rowHtml, "currentScore")).toBe("")
    expect(readLmsRowFieldFromHtml(rowHtml, "finalGrade")).toBe("")
  })

  it("reads submitted discipline state from visible LMS score and grade columns", () => {
    const rowText = "Бизнес-планирование в инновационной деятельности Экзамен 85 из 100 Сертификат «Хорошо»"

    expect(readVisibleScoreFromText(rowText)).toBe("85")
    expect(readVisibleFinalGradeFromText(rowText)).toBe("Хорошо")
  })

  it("does not invent submitted discipline state when visible score or grade is missing", () => {
    const rowText = "Программы государственной поддержки и финансирования инновационной деятельности Зачёт"

    expect(readVisibleScoreFromText(rowText)).toBe("")
    expect(readVisibleFinalGradeFromText(rowText)).toBe("")
  })

  it("marks a topic completed only by the success icon marker", () => {
    const topic = buildParsedTopic({
      disciplineId: "discipline-1",
      disciplineTitle: "Основы опытно-конструкторских работ",
      index: 0,
      learningItem,
      hasLinks: true,
      disciplineCompleted: false,
      html: `
        <li data-index="1641738">
          <a href="/lntools/mcresource/view/260050/" data-type="content">
            <i class="sidebar__icon--success"></i>
            <span>З1.1</span><span>Занятие 1.1</span>
          </a>
        </li>
      `
    })

    expect(topic?.status).toBe("completed")
    expect(topic?.accessStatus).toBe("available")
  })

  it("keeps an available topic with empty marker not started", () => {
    const topic = buildParsedTopic({
      disciplineId: "discipline-1",
      disciplineTitle: "Основы опытно-конструкторских работ",
      index: 0,
      learningItem,
      hasLinks: true,
      disciplineCompleted: false,
      html: `
        <li data-index="1680074">
          <a href="/lntools/mcresource/view/264910/" data-type="content">
            <i class="sidebar__icon--empty"></i>
            <span>З1.1</span><span>Занятие 1.1</span>
          </a>
        </li>
      `
    })

    expect(topic?.status).toBe("not_started")
    expect(topic?.accessStatus).toBe("available")
  })

  it("does not treat a plain available link as completed", () => {
    const topic = buildParsedTopic({
      disciplineId: "discipline-1",
      disciplineTitle: "Основы опытно-конструкторских работ",
      index: 0,
      learningItem,
      hasLinks: true,
      disciplineCompleted: false,
      html: `
        <li data-index="1680074">
          <a href="/lntools/mcresource/view/264910/" data-type="content">
            <span>З1.1</span><span>Занятие 1.1</span>
          </a>
        </li>
      `
    })

    expect(topic?.status).toBe("not_started")
  })

  it("marks visible active LMS item as in progress", () => {
    const topic = buildParsedTopic({
      disciplineId: "discipline-1",
      disciplineTitle: "Основы опытно-конструкторских работ",
      index: 0,
      learningItem,
      hasLinks: true,
      disciplineCompleted: false,
      html: `
        <li data-index="1680074">
          <a href="/lntools/mcresource/view/264910/" data-type="content">
            <i class="sidebar__icon--active"></i>
            <span>З1.1</span><span>Занятие 1.1</span>
          </a>
        </li>
      `
    })

    expect(topic?.status).toBe("in_progress")
  })

  it("ignores hidden active icon and respects empty marker", () => {
    const topic = buildParsedTopic({
      disciplineId: "discipline-1",
      disciplineTitle: "Основы опытно-конструкторских работ",
      index: 0,
      learningItem,
      hasLinks: true,
      disciplineCompleted: false,
      html: `
        <li data-index="1680074">
          <a href="/lntools/mcresource/view/264910/" data-type="content">
            <i class="sidebar__icon--empty"></i>
            <i class="sidebar__icon--active" style="display: none;"></i>
            <span>З1.1</span><span>Занятие 1.1</span>
          </a>
        </li>
      `
    })

    expect(topic?.status).toBe("not_started")
  })

  it("marks topics completed when the discipline is already submitted", () => {
    const topic = buildParsedTopic({
      disciplineId: "discipline-1",
      disciplineTitle: "Основы опытно-конструкторских работ",
      index: 0,
      learningItem,
      hasLinks: true,
      disciplineCompleted: true,
      html: `<li><a href="/lntools/mcresource/view/264910/" data-type="content"><i class="sidebar__icon--empty"></i></a></li>`
    })

    expect(topic?.status).toBe("completed")
  })

  it("does not append final assessment while regular topics are incomplete", () => {
    const topics = ensureFinalAssessment([
      {
        id: "topic-1",
        title: "Тема 1 — Занятие 1.1",
        kind: "learning_material",
        topicTitle: "Тема 1",
        activityTitle: "Занятие 1.1",
        status: "not_started",
        estimatedComplexity: "medium",
        accessStatus: "available"
      }
    ], "discipline-1", false)

    expect(topics.some((topic) => topic.kind === "final_assessment")).toBe(false)
  })

  it("appends final assessment after all regular topics are completed", () => {
    const topics = ensureFinalAssessment([
      {
        id: "topic-1",
        title: "Тема 1 — Занятие 1.1",
        kind: "learning_material",
        topicTitle: "Тема 1",
        activityTitle: "Занятие 1.1",
        status: "completed",
        estimatedComplexity: "medium",
        accessStatus: "available"
      }
    ], "discipline-1", false)

    expect(topics.at(-1)?.kind).toBe("final_assessment")
    expect(topics.at(-1)?.status).toBe("not_started")
  })

  it("marks final assessment completed for submitted discipline", () => {
    const topics = ensureFinalAssessment([
      {
        id: "topic-1",
        title: "Тема 1 — Занятие 1.1",
        kind: "learning_material",
        topicTitle: "Тема 1",
        activityTitle: "Занятие 1.1",
        status: "completed",
        estimatedComplexity: "medium",
        accessStatus: "available"
      }
    ], "discipline-1", true)

    expect(topics.at(-1)?.kind).toBe("final_assessment")
    expect(topics.at(-1)?.status).toBe("completed")
  })

  it("counts theme progress without mixing nested activities or final tests", () => {
    const progress = countThemeProgress([
      {
        id: "discipline-1",
        status: "in_progress",
        topics: [
          { id: "topic-1", title: "Theme 1 - Lesson 1.1", kind: "learning_material", topicTitle: "Theme 1", parentTopicTitle: "Theme 1", status: "completed" },
          { id: "topic-2", title: "Theme 1 - Self check", kind: "self_check_test", topicTitle: "Theme 1", parentTopicTitle: "Theme 1", status: "completed" },
          { id: "topic-3", title: "Theme 2 - Lesson 2.1", kind: "learning_material", topicTitle: "Theme 2", parentTopicTitle: "Theme 2", status: "completed" },
          { id: "topic-4", title: "Theme 2 - Self check", kind: "self_check_test", topicTitle: "Theme 2", parentTopicTitle: "Theme 2", status: "not_started" },
          { id: "topic-5", title: "Final test", kind: "final_test", topicTitle: "Final test", status: "not_started" }
        ]
      }
    ])

    expect(progress.totalTopics).toBe(2)
    expect(progress.completedTopics).toBe(1)
    expect(progress.remainingTopics).toBe(1)
    expect(progress.totalFinalAssessments).toBe(1)
    expect(progress.completedFinalAssessments).toBe(0)
    expect(progress.percent).toBe(50)
  })

  it("marks all grouped themes and final tests completed for a submitted discipline", () => {
    const progress = countThemeProgress([
      {
        id: "discipline-1",
        status: "completed",
        topics: [
          { id: "topic-1", title: "Theme 1 - Lesson 1.1", kind: "learning_material", topicTitle: "Theme 1", parentTopicTitle: "Theme 1", status: "not_started" },
          { id: "topic-2", title: "Theme 1 - Self check", kind: "self_check_test", topicTitle: "Theme 1", parentTopicTitle: "Theme 1", status: "not_started" },
          { id: "topic-3", title: "Final test", kind: "final_test", topicTitle: "Final test", status: "not_started" }
        ]
      }
    ])

    expect(progress.totalTopics).toBe(1)
    expect(progress.completedTopics).toBe(1)
    expect(progress.remainingTopics).toBe(0)
    expect(progress.totalFinalAssessments).toBe(1)
    expect(progress.completedFinalAssessments).toBe(1)
    expect(progress.percent).toBe(100)
  })
})
