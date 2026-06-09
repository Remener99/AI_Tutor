export const FileUpload = ({ file, onFile }: { file?: File | null; onFile: (file: File | null) => void }) => (
  <div className="ai-upload">
    <strong>Загрузите лекцию (PDF)</strong>
    <input accept="application/pdf" type="file" onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
    <span className="ai-muted">{file ? file.name : "Поддержка только текстовых PDF. Макс. размер: 10 МБ"}</span>
  </div>
)
