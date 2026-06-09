import { X } from "lucide-react"
import brandLogo from "data-base64:../../../assets/icon.png"

export const Header = ({ enabled, onToggle, onClose }: { enabled: boolean; onToggle: () => void; onClose?: () => void }) => (
  <header className="ai-topbar">
    <div className="ai-brand">
      <img className="ai-brand-logo" src={brandLogo} alt="" />
      <strong>Семпейс AI</strong>
    </div>
    <div className="ai-top-actions">
      <button className="ai-switch" role="switch" aria-checked={enabled} onClick={onToggle} type="button" title="Включить или выключить AI-тьютора">
        <span />
      </button>
      {onClose && (
        <button className="ai-icon-button" type="button" onClick={onClose} title="Свернуть AI-тьютора">
          <X size={18} />
        </button>
      )}
    </div>
  </header>
)
