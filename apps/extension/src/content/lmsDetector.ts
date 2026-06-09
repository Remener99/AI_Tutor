export const isSynergyLms = (url: string): boolean => /synergy\.ru|lms/i.test(url)

export const isSupportedLmsPage = (documentText: string): boolean =>
  /дисциплин|учебн|лекци|тем[аы]|прогресс|курс/i.test(documentText)
