import { gzipSync, gunzipSync } from "node:zlib"

type StoredTutorMaterial = {
  id: string
  lectureText: string
  fileName?: string
  pageCount: number
  createdAt: number
}

const TTL_MS = 6 * 60 * 60 * 1000
const TOKEN_PREFIX = "mat_token_"
const MAX_TOKEN_TEXT_LENGTH = 12_000
const materials = new Map<string, StoredTutorMaterial>()

const compactLectureText = (text: string) => {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (normalized.length <= MAX_TOKEN_TEXT_LENGTH) return normalized

  const headLength = Math.floor(MAX_TOKEN_TEXT_LENGTH * 0.7)
  const tailLength = MAX_TOKEN_TEXT_LENGTH - headLength
  return [
    normalized.slice(0, headLength).trim(),
    "[Фрагмент середины лекции сокращен для стабильной работы AI-репетитора после перезагрузки страницы.]",
    normalized.slice(-tailLength).trim()
  ].join("\n\n")
}

const cleanup = () => {
  const now = Date.now()
  for (const [id, material] of materials.entries()) {
    if (now - material.createdAt > TTL_MS) materials.delete(id)
  }
}

export const saveTutorMaterial = (lectureText: string, metadata?: { fileName?: string; pageCount?: number }) => {
  cleanup()
  const id = `mat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const compactText = compactLectureText(lectureText)
  const material = {
    id,
    lectureText: compactText,
    fileName: metadata?.fileName,
    pageCount: metadata?.pageCount || 0,
    createdAt: Date.now()
  }
  materials.set(id, material)

  const tokenPayload = JSON.stringify({
    lectureText: material.lectureText,
    fileName: material.fileName,
    pageCount: material.pageCount,
    createdAt: material.createdAt
  })
  return `${TOKEN_PREFIX}${gzipSync(tokenPayload).toString("base64url")}`
}

export const getTutorMaterial = (id: string) => {
  cleanup()
  const material = materials.get(id)
  if (material) return material

  if (!id.startsWith(TOKEN_PREFIX)) return undefined
  try {
    const raw = gunzipSync(Buffer.from(id.slice(TOKEN_PREFIX.length), "base64url")).toString("utf8")
    const parsed = JSON.parse(raw) as Omit<StoredTutorMaterial, "id">
    if (!parsed.lectureText || Date.now() - parsed.createdAt > TTL_MS) return undefined
    return {
      id,
      lectureText: parsed.lectureText,
      fileName: parsed.fileName,
      pageCount: parsed.pageCount || 0,
      createdAt: parsed.createdAt
    }
  } catch {
    return undefined
  }
}
