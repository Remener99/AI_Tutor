import { z } from "zod"

export const topicStatusSchema = z.enum(["not_started", "in_progress", "completed"])
export const disciplineStatusSchema = z.enum(["not_started", "in_progress", "completed", "overdue"])
export const complexitySchema = z.enum(["low", "medium", "high"])

export const studentContextSchema = z.object({
  specialty: z.string().min(1).optional(),
  course: z.string().min(1).optional(),
  educationLevel: z.string().min(1).optional(),
  studyDirection: z.string().min(1).optional(),
  studyProfile: z.string().min(1).optional(),
  currentDisciplineTitle: z.string().min(1).optional(),
  currentTopicTitle: z.string().min(1).optional()
})

export const topicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(["learning_material", "self_check_test", "final_assessment", "final_test", "competency_test", "other"]).optional(),
  topicTitle: z.string().min(1).optional(),
  activityTitle: z.string().min(1).optional(),
  parentTopicTitle: z.string().min(1).optional(),
  status: topicStatusSchema,
  estimatedComplexity: complexitySchema.optional()
})

export const disciplineSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  href: z.string().url().nullable().optional(),
  currentScore: z.string().optional(),
  finalGrade: z.string().optional(),
  status: disciplineStatusSchema,
  deadline: z.string().optional(),
  topics: z.array(topicSchema)
})

export const synergySemesterContextSchema = z.object({
  version: z.string().optional(),
  source: z.string().optional(),
  extractedAt: z.string().optional(),
  extractionDurationMs: z.number().optional(),
  page: z.object({
    title: z.string().optional(),
    url: z.string().optional()
  }).optional(),
  studentContext: z.record(z.unknown()).optional(),
  currentSemester: z.record(z.unknown()).optional(),
  semestersSummary: z.array(z.record(z.unknown())).optional(),
  summary: z.record(z.unknown()).optional(),
  subjects: z.array(z.record(z.unknown())).optional()
}).passthrough()

export const lmsSnapshotSchema = z.object({
  source: z.literal("synergy_lms"),
  capturedAt: z.string().datetime(),
  pageUrl: z.string().url().optional(),
  isSupportedPage: z.boolean(),
  isForbiddenTestPage: z.boolean(),
  studentContext: studentContextSchema.optional(),
  disciplines: z.array(disciplineSchema),
  semesterContext: synergySemesterContextSchema.optional(),
  progress: z.object({
    totalDisciplines: z.number().int().nonnegative(),
    completedDisciplines: z.number().int().nonnegative(),
    totalTopics: z.number().int().nonnegative(),
    completedTopics: z.number().int().nonnegative(),
    percent: z.number().min(0).max(100),
    sessionStartDate: z.string().optional(),
    sessionEndDate: z.string().optional()
  })
})

export const planPreferencesSchema = z.object({
  hoursPerWeek: z.number().min(1).max(80),
  availableDays: z.array(z.enum(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"])).min(1),
  strategy: z.enum(["sequential", "chaotic"]),
  sessionDuration: z.enum(["short", "long"])
})

export const generatePlanRequestSchema = z.object({
  snapshot: lmsSnapshotSchema,
  preferences: planPreferencesSchema
})

export const planCalendarItemSchema = z.object({
  date: z.string(),
  action: z.string(),
  time: z.string(),
  practiceRecommendation: z.string().optional(),
  activities: z.array(z.object({
    disciplineId: z.string().optional(),
    disciplineTitle: z.string(),
    topicTitle: z.string(),
    activityTitle: z.string().optional(),
    itemKind: z.enum(["learning_material", "self_check_test", "final_assessment", "final_test", "competency_test", "other"]).optional(),
    estimatedMinutes: z.number().int().positive().optional(),
    status: topicStatusSchema.optional()
  })).optional()
})

export const studentStateSchema = z.object({
  generatedAt: z.string().datetime(),
  student: studentContextSchema.optional(),
  semester: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    daysLeft: z.number().int().nonnegative(),
    currentDate: z.string()
  }),
  preferences: planPreferencesSchema,
  progress: z.object({
    totalDisciplines: z.number().int().nonnegative(),
    completedDisciplines: z.number().int().nonnegative(),
    totalTopics: z.number().int().nonnegative(),
    completedTopics: z.number().int().nonnegative(),
    remainingTopics: z.number().int().nonnegative(),
    completionPercent: z.number().min(0).max(100),
    estimatedHoursRemaining: z.number().nonnegative(),
    availableHoursUntilDeadline: z.number().nonnegative()
  }),
  remainingItems: z.array(z.object({
    id: z.string(),
    disciplineId: z.string(),
    disciplineTitle: z.string(),
    topicTitle: z.string(),
    activityTitle: z.string().optional(),
    itemKind: z.enum(["learning_material", "self_check_test", "final_assessment", "final_test", "competency_test", "other"]).optional(),
    complexity: complexitySchema,
    estimatedHours: z.number().positive()
  })),
  constraints: z.object({
    maxCalendarItems: z.number().int().positive(),
    allowedDatesOnly: z.boolean(),
    allowedTopicIds: z.array(z.string()),
    forbidden: z.array(z.string())
  })
})

export const aiPlanAnalysisSchema = z.object({
  summary: z.string(),
  situation: z.string(),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  confidence: z.number().min(0).max(1)
})

export const generatePlanResponseSchema = z.object({
  analysis: aiPlanAnalysisSchema.optional(),
  forecast: z.object({
    status: z.enum(["on_track", "behind"]),
    text: z.string(),
    requiredHoursPerWeek: z.number().positive().optional()
  }),
  calendar: z.array(planCalendarItemSchema),
  today: z.object({
    date: z.string(),
    items: z.array(z.string()),
    time: z.string().optional()
  }),
  progress: z.object({
    daysLeft: z.number().int().nonnegative(),
    completedTopics: z.number().int().nonnegative(),
    totalTopics: z.number().int().nonnegative(),
    forecast: z.enum(["on_track", "behind"])
  }),
  recommendations: z.array(z.string()).optional(),
  planMeta: z.object({
    source: z.enum(["llm", "llm_retry", "fallback"]),
    model: z.string().optional(),
    generatedAt: z.string().datetime(),
    validationWarnings: z.array(z.string())
  }).optional(),
  markdown: z.string()
})

export const quizQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  kind: z.enum(["open", "practical", "reflective"]),
  goodAnswerCriteria: z.array(z.string()).min(1)
})

export const generateQuizResponseSchema = z.object({
  summary: z.string(),
  concepts: z.array(z.object({
    title: z.string(),
    explanation: z.string(),
    example: z.string().optional()
  })).min(2).max(4),
  questions: z.array(quizQuestionSchema).length(5)
})

export const generateTestPrepResponseSchema = z.object({
  summary: z.string(),
  coreIdeas: z.array(z.string()).min(3).max(6),
  keyConcepts: z.array(z.object({
    title: z.string(),
    explanation: z.string()
  })).min(3).max(8),
  insights: z.array(z.string()).min(2).max(6),
  applications: z.array(z.string()).min(2).max(6),
  nextStep: z.string().optional()
})

export const feedbackResponseSchema = z.object({
  tone: z.literal("supportive"),
  summary: z.string(),
  strengths: z.array(z.string()),
  improve: z.array(z.string()),
  criteriaChecklist: z.array(z.object({
    criterion: z.string(),
    status: z.enum(["covered", "partially_covered", "missing"])
  })),
  nextStep: z.string().optional()
})

export const feedbackRequestSchema = z.object({
  question: quizQuestionSchema,
  studentAnswer: z.string().min(1),
  lectureSummary: z.string().optional(),
  studentContext: studentContextSchema.optional()
})

export const generateCaseResponseSchema = z.object({
  materialType: z.enum(["management", "technical", "humanitarian", "legal", "economic", "theoretical", "mixed"]),
  title: z.string(),
  gameTitle: z.string(),
  levelName: z.string(),
  mission: z.string(),
  lifeSituation: z.string(),
  openingQuestion: z.string(),
  thinkingCheckpoints: z.array(z.string()).min(3).max(5),
  progressLabel: z.string(),
  mentorHint: z.string().optional()
})

export const practiceDialogueMessageSchema = z.object({
  role: z.enum(["student", "tutor"]),
  content: z.string().min(1)
})

export const practiceFeedbackResponseSchema = z.object({
  tutorReply: z.string(),
  nextQuestion: z.string(),
  nudge: z.string().optional(),
  unlockedInsight: z.string().optional(),
  progress: z.object({
    stageTitle: z.string(),
    completedCheckpoints: z.number().int().min(0),
    totalCheckpoints: z.number().int().positive()
  }),
  isComplete: z.boolean()
})

export const caseFeedbackRequestSchema = z.object({
  caseData: generateCaseResponseSchema,
  messages: z.array(practiceDialogueMessageSchema),
  studentMessage: z.string().min(1),
  studentContext: studentContextSchema.optional()
})

export const apiErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "PDF_TOO_LARGE",
  "UNSUPPORTED_PDF",
  "PDF_TEXT_EMPTY",
  "LLM_ERROR",
  "SAFETY_BLOCKED",
  "RATE_LIMITED",
  "INTERNAL_ERROR"
])

export const apiErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional()
  })
})

export const caseContextSchema = z.object({
  studentContext: studentContextSchema,
  lmsSnapshot: lmsSnapshotSchema.pick({ progress: true, studentContext: true }).optional()
})

export const quizContextSchema = z.object({
  studentContext: studentContextSchema,
  isForbiddenTestPage: z.boolean().optional()
})

export const testPrepContextSchema = z.object({
  studentContext: studentContextSchema,
  isForbiddenTestPage: z.boolean().optional()
})

export const tutorContextSchema = z.object({
  studentContext: studentContextSchema,
  isForbiddenTestPage: z.boolean().optional()
})

export const tutorContextDraftResponseSchema = z.object({
  title: z.string(),
  shortSummary: z.string(),
  suggestedActions: z.array(z.string()).min(3).max(5),
  guardrails: z.array(z.string()).optional()
})

export const generateTutorContextResponseSchema = tutorContextDraftResponseSchema.extend({
  materialId: z.string().min(1)
})

export const tutorMessageSchema = z.object({
  role: z.enum(["student", "tutor"]),
  content: z.string().min(1)
})

export const tutorChatRequestSchema = z.object({
  materialId: z.string().min(1),
  studentContext: studentContextSchema.optional(),
  messages: z.array(tutorMessageSchema).max(16),
  studentMessage: z.string().min(1)
})

export const tutorChatResponseSchema = z.object({
  answer: z.string(),
  followUpQuestion: z.string().optional(),
  quickActions: z.array(z.string()).min(2).max(4).optional(),
  safetyNote: z.string().optional()
})
