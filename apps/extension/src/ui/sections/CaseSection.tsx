import { useState } from "react"
import type { GenerateCaseResponse, PracticeDialogueMessage, PracticeFeedbackResponse } from "@ai-tutor/shared"
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

export const CaseSection = ({ enabled }: { enabled: boolean }) => {
  const [file, setFile] = useState<File | null>(null)
  const [practice, setPractice] = useState<GenerateCaseResponse | null>(null)
  const [messages, setMessages] = useState<PracticeDialogueMessage[]>([])
  const [answer, setAnswer] = useState("")
  const [lastTurn, setLastTurn] = useState<PracticeFeedbackResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const generate = async () => {
    const validation = validatePdfFile(file)
    if (validation || !file) return setError(validation ?? undefined)
    setLoading(true)
    setError(undefined)
    try {
      const progress = await readCurrentProgress()
      const response = await apiClient.generateCase(file, progress.studentContext ?? {})
      setPractice(response)
      setMessages([{ role: "tutor", content: response.openingQuestion }])
      setAnswer("")
      setLastTurn(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось запустить практический диалог.")
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    if (!practice || !answer.trim()) return
    const studentMessage = answer.trim()
    setLoading(true)
    setError(undefined)
    try {
      const response = await apiClient.caseFeedback({ caseData: practice, messages, studentMessage })
      setMessages((prev) => [...prev, { role: "student", content: studentMessage }, { role: "tutor", content: `${response.tutorReply}\n\n${response.nextQuestion}` }])
      setAnswer("")
      setLastTurn(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось продолжить диалог.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card>
        <FileUpload file={file} onFile={setFile} />
        <div className="ai-actions">
          <Button disabled={!enabled || !file || loading} onClick={generate}>{loading && !practice ? "Анализируем лекцию..." : "Запустить диалог практики"}</Button>
        </div>
        {loading && <ProgressBar />}
        <ErrorState message={error} />
        <Disclaimer />
      </Card>
      {practice && (
        <Card>
          <h2>{practice.gameTitle}</h2>
          <p><strong>{practice.levelName}</strong></p>
          <p>{practice.lifeSituation}</p>
          <div className="ai-chat">
            {messages.map((message, index) => (
              <div className={message.role === "student" ? "ai-chat-bubble is-student" : "ai-chat-bubble"} key={`${message.role}-${index}`}>
                {message.content}
              </div>
            ))}
          </div>
          {lastTurn?.unlockedInsight && <div className="ai-feedback"><strong>Инсайт:</strong> {lastTurn.unlockedInsight}</div>}
          <TextArea placeholder="Ответьте своими словами..." value={answer} onChange={(event) => setAnswer(event.target.value)} />
          <Button disabled={loading || !answer.trim()} onClick={send}>Продолжить диалог</Button>
          <Disclaimer />
        </Card>
      )}
    </>
  )
}
