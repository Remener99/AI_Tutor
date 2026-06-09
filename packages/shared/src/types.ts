import type { z } from "zod"
import type {
  apiErrorResponseSchema,
  caseFeedbackRequestSchema,
  disciplineSchema,
  feedbackRequestSchema,
  feedbackResponseSchema,
  generateCaseResponseSchema,
  generatePlanRequestSchema,
  generatePlanResponseSchema,
  generateTestPrepResponseSchema,
  practiceFeedbackResponseSchema,
  practiceDialogueMessageSchema,
  studentStateSchema,
  generateQuizResponseSchema,
  generateTutorContextResponseSchema,
  lmsSnapshotSchema,
  planPreferencesSchema,
  quizQuestionSchema,
  studentContextSchema,
  topicSchema,
  tutorChatRequestSchema,
  tutorChatResponseSchema,
  tutorContextDraftResponseSchema,
  tutorMessageSchema
} from "./schemas.js"

export type StudentContext = z.infer<typeof studentContextSchema>
export type Topic = z.infer<typeof topicSchema>
export type Discipline = z.infer<typeof disciplineSchema>
export type LmsSnapshot = z.infer<typeof lmsSnapshotSchema>
export type PlanPreferences = z.infer<typeof planPreferencesSchema>
export type GeneratePlanRequest = z.infer<typeof generatePlanRequestSchema>
export type GeneratePlanResponse = z.infer<typeof generatePlanResponseSchema>
export type StudentState = z.infer<typeof studentStateSchema>
export type QuizQuestion = z.infer<typeof quizQuestionSchema>
export type GenerateQuizResponse = z.infer<typeof generateQuizResponseSchema>
export type GenerateTestPrepResponse = z.infer<typeof generateTestPrepResponseSchema>
export type TutorContextDraftResponse = z.infer<typeof tutorContextDraftResponseSchema>
export type GenerateTutorContextResponse = z.infer<typeof generateTutorContextResponseSchema>
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>
export type GenerateCaseResponse = z.infer<typeof generateCaseResponseSchema>
export type CaseFeedbackRequest = z.infer<typeof caseFeedbackRequestSchema>
export type PracticeFeedbackResponse = z.infer<typeof practiceFeedbackResponseSchema>
export type PracticeDialogueMessage = z.infer<typeof practiceDialogueMessageSchema>
export type TutorMessage = z.infer<typeof tutorMessageSchema>
export type TutorChatRequest = z.infer<typeof tutorChatRequestSchema>
export type TutorChatResponse = z.infer<typeof tutorChatResponseSchema>
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>

export type ApiResult<T> = T | ApiErrorResponse
