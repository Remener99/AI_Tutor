import { useEffect, useState } from "react"
import "./ui/styles.css"
import { STORAGE_KEYS } from "./storage/keys"
import { getLocal, setLocal } from "./storage/storage"
import { Header } from "./ui/components/Header"
import { Disclaimer } from "./ui/components/Disclaimer"
import { OneButtonTutor } from "./ui/sections/OneButtonTutor"

const Popup = () => {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    void getLocal(STORAGE_KEYS.extensionEnabled, true).then(setEnabled)
  }, [])

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    void setLocal(STORAGE_KEYS.extensionEnabled, next)
  }

  return (
    <main className="ai-shell">
      <Header enabled={enabled} onToggle={toggle} />
      {!enabled && <div className="ai-error">Расширение выключено. AI-функции недоступны.</div>}
      <OneButtonTutor enabled={enabled} />
      <Disclaimer />
    </main>
  )
}

export default Popup
