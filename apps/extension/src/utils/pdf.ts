export const validatePdfFile = (file: File | null): string | null => {
  if (!file) return "Загрузите PDF-файл."
  if (file.type !== "application/pdf") return "Файл не поддерживается. Загрузите PDF с материалом темы."
  if (file.size > 10 * 1024 * 1024) return "Файл слишком большой. Максимальный размер PDF - 10 МБ."
  return null
}
