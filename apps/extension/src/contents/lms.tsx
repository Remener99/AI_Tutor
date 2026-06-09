import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"
import cssText from "data-text:../ui/styles.css"
import { Header } from "../ui/components/Header"
import { Disclaimer } from "../ui/components/Disclaimer"
import { OneButtonTutor } from "../ui/sections/OneButtonTutor"
import { STORAGE_KEYS } from "../storage/keys"
import { getLocal, setLocal } from "../storage/storage"

export const config: PlasmoCSConfig = {
  matches: ["https://*.synergy.ru/*"],
  all_frames: false
}

const PanelApp = () => {
  const [enabled, setEnabled] = useState(true)
  const [collapsed, setCollapsed] = useState(true)
  const [currentHref, setCurrentHref] = useState(() => location.href)
  const [blockedNotice, setBlockedNotice] = useState(false)

  const isAssessmentPage = (() => {
    try {
      return new URL(currentHref).pathname.startsWith("/assessments")
    } catch {
      return currentHref.includes("/assessments")
    }
  })()

  useEffect(() => {
    void getLocal(STORAGE_KEYS.extensionEnabled, true).then(setEnabled)
    void getLocal<{ collapsed?: boolean; firstOpenDone?: boolean }>(STORAGE_KEYS.panelState, {}).then((stored) => {
      if (!stored.firstOpenDone) {
        setCollapsed(false)
        void setLocal(STORAGE_KEYS.panelState, { ...stored, collapsed: false, firstOpenDone: true })
        return
      }
      setCollapsed(Boolean(stored.collapsed))
    })
  }, [])

  useEffect(() => {
    const updateHref = () => setCurrentHref(location.href)
    const originalPushState = history.pushState
    const originalReplaceState = history.replaceState

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args)
      window.setTimeout(updateHref, 0)
      return result
    }
    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args)
      window.setTimeout(updateHref, 0)
      return result
    }

    window.addEventListener("popstate", updateHref)
    window.addEventListener("hashchange", updateHref)

    return () => {
      history.pushState = originalPushState
      history.replaceState = originalReplaceState
      window.removeEventListener("popstate", updateHref)
      window.removeEventListener("hashchange", updateHref)
    }
  }, [])

  useEffect(() => {
    if (isAssessmentPage) setCollapsed(true)
  }, [isAssessmentPage])

  useEffect(() => {
    if (!blockedNotice) return
    const timer = window.setTimeout(() => setBlockedNotice(false), 2600)
    return () => window.clearTimeout(timer)
  }, [blockedNotice])

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    void setLocal(STORAGE_KEYS.extensionEnabled, next)
  }

  const togglePanel = () => {
    if (isAssessmentPage) {
      setCollapsed(true)
      setBlockedNotice(true)
      return
    }
    setCollapsed((value) => {
      const next = !value
      void setLocal(STORAGE_KEYS.panelState, { collapsed: next, firstOpenDone: true })
      return next
    })
  }

  return (
    <div className={collapsed ? "ai-embedded is-collapsed" : "ai-embedded"}>
      <button className="ai-embedded-tab" type="button" onClick={togglePanel}>
        AI
      </button>
      {blockedNotice && <div className="ai-test-toast">Во время теста Семпейс AI недоступен</div>}
      {!isAssessmentPage && (
        <main className={collapsed ? "ai-shell ai-embedded-shell is-hidden" : "ai-shell ai-embedded-shell"}>
          <Header enabled={enabled} onToggle={toggle} onClose={() => {
            setCollapsed(true)
            void setLocal(STORAGE_KEYS.panelState, { collapsed: true, firstOpenDone: true })
          }} />
          {!enabled && <div className="ai-error">Расширение выключено. AI-функции недоступны.</div>}
          <OneButtonTutor enabled={enabled} />
          <Disclaimer />
        </main>
      )}
    </div>
  )
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = `
    ${cssText}
    :host {
      all: initial;
      --ai-bg: #f6f6f6;
      --ai-surface: #ffffff;
      --ai-surface-muted: #f1f1f1;
      --ai-primary: #e31b23;
      --ai-primary-hover: #c9141b;
      --ai-primary-soft: #fff0f1;
      --ai-accent: #e31b23;
      --ai-ink: #111111;
      --ai-text: #111111;
      --ai-text-muted: #666666;
      --ai-border: #dedede;
      --ai-success: #22a857;
      --ai-warning: #f59e0b;
      --ai-danger: #ef4444;
      --ai-shadow-card: 0 14px 36px rgba(17, 17, 17, 0.08);
    }
    .ai-embedded, .ai-embedded * { box-sizing: border-box; }
    .ai-embedded { position: fixed; top: 84px; right: 12px; width: 430px; max-height: calc(100vh - 104px); z-index: 2147483647; font-family: Inter, Arial, sans-serif; }
    .ai-embedded-shell { width: 430px; min-height: auto; max-height: calc(100vh - 104px); border: 1px solid rgba(222, 222, 222, 0.9); border-radius: 16px; box-shadow: 0 24px 70px rgba(17, 17, 17, 0.22); }
    .ai-embedded-shell.is-hidden { display: none; }
    .ai-embedded-tab { position: absolute; right: 0; top: 0; width: 44px; height: 44px; border: 1px solid rgba(222, 222, 222, 0.9); border-radius: 12px; background: #ffffff; color: var(--ai-text); font-weight: 900; cursor: pointer; box-shadow: 0 12px 32px rgba(17, 17, 17, 0.16); }
    .ai-test-toast { position: absolute; right: 54px; top: 0; min-width: 260px; max-width: 320px; padding: 12px 14px; border: 1px solid #ffd0d2; border-radius: 12px; color: #9f1118; background: #fff7f7; font: 800 13px/1.35 Inter, Arial, sans-serif; box-shadow: 0 14px 36px rgba(17, 17, 17, 0.16); }
    .ai-embedded:not(.is-collapsed) .ai-embedded-tab { right: 444px; }
    .ai-embedded:not(.is-collapsed) .ai-test-toast { right: 444px; }
    .ai-embedded.is-collapsed { width: 42px; height: 42px; }
    .ai-embedded button { font: inherit; }
    .ai-embedded .ai-button:not(.secondary):not(.ghost) {
      background: var(--ai-primary) !important;
      border-color: var(--ai-primary) !important;
      color: #ffffff !important;
    }
    .ai-embedded .ai-button.secondary {
      background: #fff !important;
      color: var(--ai-primary) !important;
      border-color: var(--ai-primary) !important;
    }
    .ai-embedded .ai-button:disabled {
      background: #d8d8d8 !important;
      border-color: #d8d8d8 !important;
      color: #8d8d8d !important;
    }
    .ai-embedded .ai-switch {
      display: inline-block !important;
      flex: 0 0 auto;
      width: 38px !important;
      height: 20px !important;
      padding: 2px !important;
      border: 1px solid #111111 !important;
      border-radius: 999px !important;
      background: #fff !important;
      appearance: none;
    }
    .ai-embedded .ai-switch span {
      display: block !important;
      width: 14px !important;
      height: 14px !important;
      border-radius: 999px !important;
      background: var(--ai-primary) !important;
      transition: transform .16s;
    }
    .ai-embedded .ai-switch[aria-checked="false"] span { transform: translateX(0); background: var(--ai-text-muted) !important; }
    .ai-embedded .ai-switch[aria-checked="true"] span { transform: translateX(17px); }
  `
  return style
}

export default PanelApp
