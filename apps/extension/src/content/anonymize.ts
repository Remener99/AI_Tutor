export const anonymizeText = (value: string): string =>
  value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(?:\+?\d[\s()-]*){10,}/g, "[phone]")
    .replace(/\b\d{7,}\b/g, "[id]")
    .replace(/https?:\/\/\S+\?\S+/g, "[url]")
    .replace(/(ФИО|Студент|Обучающийся)\s*[:\-]?\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,2}/g, "$1: [name]")
