import pdfParse from "pdf-parse"
import { ApiError } from "../utils/errors.js"

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MIN_TEXT_LENGTH = 80

export type ExtractedPdfDocument = {
  text: string
  pageCount: number
  info?: Record<string, unknown>
}

export const validatePdfMeta = (mimeType?: string, size?: number) => {
  if (size && size > MAX_PDF_BYTES) {
    throw new ApiError("PDF_TOO_LARGE", "Файл слишком большой. Максимальный размер PDF — 10 МБ.", 413)
  }

  if (mimeType !== "application/pdf") {
    throw new ApiError("UNSUPPORTED_PDF", "Файл не поддерживается. Загрузите текстовую лекцию.", 415)
  }
}

export const extractPdfDocument = async (buffer: Buffer): Promise<ExtractedPdfDocument> => {
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new ApiError("PDF_TOO_LARGE", "Файл слишком большой. Максимальный размер PDF — 10 МБ.", 413)
  }

  try {
    const result = await pdfParse(buffer)
    const text = result.text.replace(/\s+/g, " ").trim()
    if (text.length < MIN_TEXT_LENGTH) {
      throw new ApiError("PDF_TEXT_EMPTY", "Файл не поддерживается. Загрузите текстовую лекцию.", 422)
    }
    return {
      text: text.slice(0, 35_000),
      pageCount: result.numpages || 0,
      info: result.info
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError("UNSUPPORTED_PDF", "Файл не поддерживается. Загрузите текстовую лекцию.", 422)
  }
}

export const extractPdfText = async (buffer: Buffer): Promise<string> => {
  const document = await extractPdfDocument(buffer)
  return document.text
}
