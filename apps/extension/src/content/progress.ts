type TopicKind = "learning_material" | "self_check_test" | "final_assessment" | "final_test" | "competency_test" | "other"
type TopicStatus = "not_started" | "in_progress" | "completed"
type DisciplineStatus = "not_started" | "in_progress" | "completed" | "overdue"

type ProgressTopic = {
  id?: string
  title: string
  kind?: TopicKind
  topicTitle?: string
  activityTitle?: string
  parentTopicTitle?: string
  status: TopicStatus
}

type ProgressDiscipline = {
  id?: string
  status?: DisciplineStatus
  topics: ProgressTopic[]
}

type ProgressGroup = {
  totalItems: number
  completedItems: number
}

type ProgressBuckets = {
  theme: Map<string, ProgressGroup>
  final: Map<string, ProgressGroup>
}

const normalize = (value: string | null | undefined) => (value || "").replace(/\s+/g, " ").trim().toLowerCase()

const finalKind = new Set<TopicKind>(["final_assessment", "final_test", "competency_test"])
const finalTitlePattern = /\u0438\u0442\u043e\u0433\u043e\u0432(?:\u0430\u044f\s+\u0430\u0442\u0442\u0435\u0441\u0442\u0430\u0446\u0438\u044f|\u044b\u0439\s+\u0442\u0435\u0441\u0442)|\u043a\u043e\u043c\u043f\u0435\u0442\u0435\u043d\u0442\u043d\u043e\u0441\u0442\u043d(?:\u044b\u0439|\u043e\u0439)\s+\u0442\u0435\u0441\u0442|\u044d\u043a\u0437\u0430\u043c\u0435\u043d\u0430\u0446\u0438\u043e\u043d\u043d(?:\u044b\u0439|\u043e\u0439)\s+\u0442\u0435\u0441\u0442|final\s*(?:assessment|test)|exam/i
const themeNumberPattern = /\u0442\u0435\u043c\u0430\s+\d+/i

const isFinalTopic = (topic: ProgressTopic) => {
  if (topic.kind && finalKind.has(topic.kind)) return true
  return finalTitlePattern.test(`${topic.title} ${topic.topicTitle || ""} ${topic.activityTitle || ""}`)
}

const hasPlannableTopicShape = (topic: ProgressTopic) =>
  Boolean(topic.parentTopicTitle || topic.topicTitle || topic.activityTitle || topic.kind === "learning_material" || topic.kind === "self_check_test")

const topicGroupKey = (topic: ProgressTopic) => {
  const source = topic.parentTopicTitle || topic.topicTitle || topic.title.match(themeNumberPattern)?.[0] || topic.title
  return normalize(source)
}

export const countThemeProgress = (disciplines: ProgressDiscipline[]) => {
  let totalTopics = 0
  let completedTopics = 0
  let totalFinalAssessments = 0
  let completedFinalAssessments = 0

  for (const discipline of disciplines) {
    const groups: ProgressBuckets = {
      theme: new Map<string, ProgressGroup>(),
      final: new Map<string, ProgressGroup>()
    }

    for (const topic of discipline.topics) {
      const finalTopic = isFinalTopic(topic)
      if (!finalTopic && topic.kind === "other" && !hasPlannableTopicShape(topic)) continue
      const bucket = finalTopic ? groups.final : groups.theme
      const key = `${discipline.id || ""}:${topicGroupKey(topic)}`
      const group = bucket.get(key) || { totalItems: 0, completedItems: 0 }
      group.totalItems += 1
      if (discipline.status === "completed" || topic.status === "completed") group.completedItems += 1
      bucket.set(key, group)
    }

    for (const group of groups.theme.values()) {
      totalTopics += 1
      if (group.totalItems > 0 && group.completedItems >= group.totalItems) completedTopics += 1
    }

    for (const group of groups.final.values()) {
      totalFinalAssessments += 1
      if (group.totalItems > 0 && group.completedItems >= group.totalItems) completedFinalAssessments += 1
    }
  }

  return {
    totalTopics,
    completedTopics,
    remainingTopics: Math.max(totalTopics - completedTopics, 0),
    totalFinalAssessments,
    completedFinalAssessments,
    remainingFinalAssessments: Math.max(totalFinalAssessments - completedFinalAssessments, 0),
    percent: totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0
  }
}
