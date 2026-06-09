import { useMemo, useState } from "react"
import type { ReactNode } from "react"
import { CalendarDays, CheckCircle2, RefreshCw, Shield, Target } from "lucide-react"
import type { GeneratePlanResponse, LmsSnapshot, PlanPreferences } from "@ai-tutor/shared"
import { apiClient } from "../../api/client"
import { readCurrentProgress } from "../../content"
import { STORAGE_KEYS } from "../../storage/keys"
import { setLocal } from "../../storage/storage"
import { Button } from "../components/Button"
import { Card } from "../components/Card"
import { ErrorState } from "../components/ErrorState"
import { NumberInput, Select } from "../components/Inputs"
import { ProgressBar } from "../components/ProgressBar"

const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const
const dayNames = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"]

const formatCalendarDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getDate()} ${date.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "")} (${dayNames[date.getDay()]})`
}

const PlanAction = ({ action }: { action: string }) => {
  const [discipline, ...topicParts] = action.split(" — ")
  const topic = topicParts.join(" — ")
  if (!topic) return <span>{action}</span>
  return (
    <span className="ai-plan-action">
      <strong>{discipline}</strong>
      <span>{topic}</span>
    </span>
  )
}

const PlanCard = ({
  icon,
  title,
  children
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) => (
  <section className="ai-plan-card">
    <div className="ai-plan-icon">{icon}</div>
    <div className="ai-plan-content">
      <h3>{title}</h3>
      {children}
    </div>
  </section>
)

const PlanResult = ({
  plan,
  onRecalculate
}: {
  plan: GeneratePlanResponse
  onRecalculate: () => void
}) => {
  const [showAll, setShowAll] = useState(false)
  const visibleCalendar = showAll ? plan.calendar : plan.calendar.slice(0, 12)

  return (
    <div className="ai-plan-result">
      <div className="ai-plan-title-row">
        <h2>Твой персональный план до конца сессии</h2>
      </div>

      <PlanCard icon={<CheckCircle2 size={22} />} title="Общий прогноз">
        <p className="ai-plan-forecast">
          <span className={plan.forecast.status === "on_track" ? "ai-good-dot" : "ai-warn-dot"} />
          {plan.forecast.text}
        </p>
        {plan.analysis && (
          <div className="ai-plan-analysis">
            <strong>{plan.analysis.summary}</strong>
            <span>{plan.analysis.situation}</span>
          </div>
        )}
      </PlanCard>

      <PlanCard icon={<CalendarDays size={22} />} title="Календарь действий">
        <p className="ai-calendar-summary">План покрывает {plan.calendar.length} учебных элементов.</p>
        <div className="ai-plan-table-wrap">
          <table className="ai-plan-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Что делать?</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {visibleCalendar.map((item) => (
                <tr key={`${item.date}-${item.action}`}>
                  <td>{formatCalendarDate(item.date)}</td>
                  <td><PlanAction action={item.action} /></td>
                  <td>{item.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.calendar.length > 12 && (
          <button className="ai-link-button" type="button" onClick={() => setShowAll((prev) => !prev)}>
            {showAll ? "Скрыть" : "Показать все действия"}
          </button>
        )}
      </PlanCard>

      <PlanCard icon={<Target size={22} />} title="Что делать сегодня?">
        <ul className="ai-today-list">
          {plan.today.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </PlanCard>

      {plan.recommendations?.length ? (
        <PlanCard icon={<Target size={22} />} title="Рекомендации AI">
          <ul className="ai-today-list">
            {plan.recommendations.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </PlanCard>
      ) : null}

      <div className="ai-plan-buttons">
        <Button variant="secondary" onClick={onRecalculate}><RefreshCw size={16} /> Пересчитать</Button>
      </div>

      <div className="ai-plan-disclaimer">
        <Shield size={24} />
        <span>Вы используете AI-тьютор добровольно. Ответственность за сдачу дисциплин — ваша.</span>
      </div>
    </div>
  )
}

export const PlanSection = ({ enabled }: { enabled: boolean }) => {
  const [snapshot, setSnapshot] = useState<LmsSnapshot | null>(null)
  const [preferences, setPreferences] = useState<Partial<PlanPreferences>>({ availableDays: [] })
  const [plan, setPlan] = useState<GeneratePlanResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [readingProgress, setReadingProgress] = useState(false)
  const [error, setError] = useState<string>()

  const canGenerate = useMemo(() => Boolean(
    enabled &&
    snapshot?.isSupportedPage &&
    !snapshot?.isForbiddenTestPage &&
    preferences.hoursPerWeek &&
    preferences.availableDays?.length &&
    preferences.strategy &&
    preferences.sessionDuration
  ), [enabled, snapshot, preferences])

  const readProgress = async () => {
    setError(undefined)
    setReadingProgress(true)
    try {
      const result = await readCurrentProgress()
      setSnapshot(result)
      await setLocal(STORAGE_KEYS.lastLmsSnapshot, result)
      if (result.isForbiddenTestPage) setError("AI-тьютор недоступен на страницах официальных тестов.")
      else if (!result.isSupportedPage) setError("Не удалось определить структуру LMS на этой странице. Перейдите на страницу дисциплины или учебного плана и попробуйте снова.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось считать прогресс LMS.")
    } finally {
      setReadingProgress(false)
    }
  }

  const generate = async () => {
    if (!snapshot || !canGenerate) return
    setLoading(true)
    setError(undefined)
    try {
      const response = await apiClient.generatePlan({ snapshot, preferences: preferences as PlanPreferences })
      setPlan(response)
      await setLocal(STORAGE_KEYS.lastPlan, response)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сформировать план.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="ai-actions">
        <Button variant="ghost" disabled={!enabled || readingProgress} onClick={readProgress}>
          {readingProgress ? "Считываем прогресс..." : "Считать текущий прогресс"}
        </Button>
        {readingProgress && <ProgressBar />}
        {!snapshot && <p className="ai-muted">Сначала считайте текущий прогресс.</p>}
        {snapshot?.isSupportedPage && <p className="ai-success">Прогресс считан: {snapshot.progress.completedTopics} из {snapshot.progress.totalTopics} тем.</p>}
      </div>
      <ErrorState message={error} />

      {!plan && (
        <Card>
          <h2>Персональный план</h2>
          <div className="ai-field">
            <label>Сколько часов в неделю можешь учиться?</label>
            <NumberInput min={1} max={80} value={preferences.hoursPerWeek ?? ""} onChange={(event) => setPreferences((prev) => ({ ...prev, hoursPerWeek: Number(event.target.value) }))} />
          </div>
          <div className="ai-field">
            <label>Какие дни недели подходят?</label>
            <div className="ai-days">
              {days.map((day) => (
                <label className="ai-check" key={day}>
                  <input type="checkbox" checked={preferences.availableDays?.includes(day) ?? false} onChange={(event) => setPreferences((prev) => ({
                    ...prev,
                    availableDays: event.target.checked ? [...(prev.availableDays ?? []), day] : (prev.availableDays ?? []).filter((item) => item !== day)
                  }))} />
                  {day}
                </label>
              ))}
            </div>
          </div>
          <div className="ai-field">
            <label>Как проходишь дисциплины?</label>
            <Select value={preferences.strategy ?? ""} onChange={(event) => setPreferences((prev) => ({ ...prev, strategy: event.target.value as PlanPreferences["strategy"] }))}>
              <option value="">Выберите</option>
              <option value="sequential">Последовательно</option>
              <option value="chaotic">Хаотично</option>
            </Select>
          </div>
          <div className="ai-field">
            <label>Какие сессии удобнее?</label>
            <Select value={preferences.sessionDuration ?? ""} onChange={(event) => setPreferences((prev) => ({ ...prev, sessionDuration: event.target.value as PlanPreferences["sessionDuration"] }))}>
              <option value="">Выберите</option>
              <option value="short">Короткие, 30 мин</option>
              <option value="long">Длинные, 1.5 ч</option>
            </Select>
          </div>
          <Button disabled={!canGenerate || loading} onClick={generate}>{loading ? "Формируем..." : "Сформировать персональный план"}</Button>
          {loading && <ProgressBar />}
        </Card>
      )}

      {plan && <PlanResult plan={plan} onRecalculate={generate} />}
    </>
  )
}
