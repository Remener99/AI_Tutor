import { useState } from "react"
import type { FeedbackResponse, GenerateQuizResponse, LmsSnapshot } from "@ai-tutor/shared"
import { apiClient } from "../../api/client"
import { readCurrentProgress } from "../../content"
import { validatePdfFile } from "../../utils/pdf"
import { Button } from "../components/Button"
import { Card } from "../components/Card"
import { Disclaimer } from "../components/Disclaimer"
import { ErrorState } from "../components/ErrorState"
import { FileUpload } from "../components/FileUpload"
import { TextArea } from "../components/Inputs"
import { ProgressBar } from "../components/ProgressBar"

export const QuizSection = ({ enabled }: { enabled: boolean }) => {
  const [file, setFile] = useState<File | null>(null)
  const [snapshot, setSnapshot] = useState<LmsSnapshot | null>(null)
  const [quiz, setQuiz] = useState<GenerateQuizResponse | null>(null)
  const [answer, setAnswer] = useState("")
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const current = quiz?.questions[index]

  const generate = async () => {
    const validation = validatePdfFile(file)
    if (validation || !file) return setError(validation ?? undefined)
    setLoading(true)
    setError(undefined)
    try {
      const progress = await readCurrentProgress()
      setSnapshot(progress)
      const response = await apiClient.generateQuiz(file, progress.studentContext ?? {}, progress.isForbiddenTestPage)
      setQuiz(response)
      setIndex(0)
      setAnswer("")
      setFeedback(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сгенерировать мини-квиз.")
    } finally {
      setLoading(false)
    }
  }

  const check = async () => {
    if (!current || !answer.trim()) return
    setLoading(true)
    setError(undefined)
    try {
      setFeedback(await apiClient.quizFeedback({ question: current, studentAnswer: answer, lectureSummary: quiz?.summary, studentContext: snapshot?.studentContext }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось получить фидбек.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card>
        <FileUpload file={file} onFile={setFile} />
        <div className="ai-actions">
          <Button disabled={!enabled || !file || loading} onClick={generate}>{loading && !quiz ? "Анализируем PDF..." : "Сгенерировать мини-квиз"}</Button>
        </div>
        {loading && <ProgressBar />}
        <ErrorState message={error} />
        <Disclaimer />
      </Card>
      {quiz && current && (
        <Card>
          <h2>О чём эта лекция?</h2>
          <p>{quiz.summary}</p>
          <h3>Ключевые идеи</h3>
          {quiz.concepts.map((concept) => <p key={concept.title}><strong>{concept.title}:</strong> {concept.explanation}</p>)}
          <div className="ai-question-index">Вопрос {index + 1} из {quiz.questions.length}</div>
          <h3>{current.question}</h3>
          <TextArea placeholder="Ваш ответ здесь..." value={answer} onChange={(event) => setAnswer(event.target.value)} />
          <div className="ai-two">
            <Button disabled={!answer.trim() || loading} onClick={check}>Проверить</Button>
            <Button variant="secondary" onClick={() => { setIndex((index + 1) % quiz.questions.length); setAnswer(""); setFeedback(null) }}>Пропустить</Button>
          </div>
          {feedback && <div className="ai-card"><strong>{feedback.summary}</strong><ul>{feedback.improve.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          <Disclaimer />
        </Card>
      )}
    </>
  )
}
