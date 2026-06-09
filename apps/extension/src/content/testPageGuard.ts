export const detectForbiddenTestPage = (url: string, text: string): boolean => {
  const haystack = `${url} ${text}`.toLowerCase()
  return [
    "итоговый тест",
    "компетентностный тест",
    "контрольный тест",
    "экзаменационный тест",
    "final-test",
    "exam",
    "testattempt",
    "/assessments"
  ].some((marker) => haystack.includes(marker))
}
