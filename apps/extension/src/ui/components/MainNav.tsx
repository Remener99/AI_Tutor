import clsx from "clsx"

export type SectionKey = "plan" | "quiz" | "case"

const labels: Record<SectionKey, string> = {
  plan: "Персональный план",
  quiz: "Подготовка к тесту",
  case: "Практические кейсы"
}

export const MainNav = ({ active, onChange }: { active: SectionKey; onChange: (section: SectionKey) => void }) => (
  <nav className="ai-nav">
    {(Object.keys(labels) as SectionKey[]).map((key) => (
      <button key={key} className={clsx("ai-nav-button", active === key && "is-active")} onClick={() => onChange(key)} type="button">
        {labels[key]}
      </button>
    ))}
  </nav>
)
