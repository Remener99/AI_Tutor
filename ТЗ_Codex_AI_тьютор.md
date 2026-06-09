# Техническое задание для Codex: AI-тьютор для Synergy LMS

## 0. Назначение документа

Этот файл является рабочим техническим заданием для разработки MVP браузерного расширения **AI-тьютор** и backend-сервиса к нему.

Codex должен использовать этот документ как основной источник требований при генерации кода. Результатом разработки должен стать рабочий проект, в котором реализованы:

1. **Frontend**: браузерное расширение Chrome Manifest V3 на TypeScript + React + Plasmo.
2. **Backend**: TypeScript API-сервис для генерации персонального плана, мини-квизов, практических кейсов, фидбека и извлечения текста из PDF.
3. **Связка Frontend ↔ Backend**: расширение собирает обезличенный учебный контекст из DOM LMS, отправляет его на backend, получает структурированный ответ и отображает его в интерфейсе.
4. **Этические ограничения**: расширение работает read-only, не изменяет LMS, не проходит тесты за студента, не подсказывает ответы на официальные тесты и не активно на страницах итоговых/компетентностных тестов.

Документ должен быть сопоставим по смыслу с README проекта и UI/UX-референсом: расширение помогает студенту планировать учебу, глубже понимать лекции и тренироваться на безопасных открытых заданиях.

---

## 1. Контекст проекта

### 1.1. Продукт

**AI-тьютор** — браузерное расширение для студентов дистанционного обучения в Synergy LMS.

Задача продукта — помочь студенту:

- увидеть текущий прогресс по дисциплинам;
- сформировать персональный план до конца сессии;
- разобрать лекцию через саммари и мини-квиз;
- получить практический кейс по материалу лекции;
- получить мягкий фидбек по своему ответу;
- не нарушать академическую честность.

### 1.2. Основные принципы

Расширение должно:

- работать **только в режиме чтения**;
- не кликать по LMS от имени пользователя;
- не отправлять формы в LMS;
- не менять DOM LMS, кроме собственного UI-контейнера расширения;
- не быть активным на страницах итоговых тестов, компетентностных тестов и официальных проверочных форм;
- не генерировать готовые ответы для сдачи;
- не подсказывать ответы на официальные тесты;
- использовать минимально необходимый и обезличенный контекст;
- явно показывать дисклеймер:  
  **«Вы используете AI-тьютор добровольно. Ответственность за сдачу дисциплин — ваша.»**

---

## 2. Требуемый технологический стек

### 2.1. Frontend / Extension

Использовать:

- **TypeScript**
- **React**
- **Plasmo Framework**
- **Chrome Extension Manifest V3**
- CSS Modules или обычный CSS с BEM-подобными классами
- `chrome.storage.local` для локального хранения пользовательских настроек и последнего результата
- `chrome.runtime.sendMessage` / Plasmo messaging для связи content script ↔ UI

Допустимые дополнительные библиотеки:

- `zod` — валидация DTO
- `react-markdown` — безопасный рендер Markdown-ответов AI
- `lucide-react` — иконки, если удобно
- `clsx` — условные классы
- `jspdf` или `html2canvas` + `jspdf` — если реализуется экспорт плана в PDF

### 2.2. Backend

Использовать:

- **Node.js 20+**
- **TypeScript**
- **Fastify** как HTTP API framework
- `@fastify/cors`
- `@fastify/multipart`
- `@fastify/rate-limit`
- `zod` или `typebox` для DTO validation
- `openai` SDK для LLM
- `pdf-parse` или аналог для извлечения текста из текстовых PDF
- `pino` для логирования
- `dotenv` для конфигурации
- `vitest` для тестов

Для MVP база данных **не обязательна**. По умолчанию backend не должен сохранять учебный контент, PDF или ответы студента. Если нужен audit/logging — логировать только технические события без текста лекции и без персональных данных.

### 2.3. Монорепозиторий

Если текущий репозиторий уже содержит Plasmo-проект, backend добавить рядом. Рекомендуемая структура:

```text
.
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── apps/
│   ├── extension/
│   │   ├── package.json
│   │   ├── plasmo.config.ts
│   │   ├── src/
│   │   │   ├── api/
│   │   │   ├── content/
│   │   │   ├── messaging/
│   │   │   ├── storage/
│   │   │   ├── types/
│   │   │   └── ui/
│   │   └── public/
│   └── backend/
│       ├── package.json
│       ├── src/
│       │   ├── app.ts
│       │   ├── server.ts
│       │   ├── config/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── prompts/
│       │   ├── schemas/
│       │   ├── types/
│       │   └── utils/
│       └── tests/
├── packages/
│   └── shared/
│       ├── package.json
│       └── src/
│           ├── dto.ts
│           ├── schemas.ts
│           └── types.ts
└── docs/
    ├── UI_UX.md
    └── TECHNICAL_SPEC_CODEX.md
```

Если перенос текущих файлов в `apps/extension` слишком рискованный, допустимо оставить существующую структуру `src/`, `public/` в корне и добавить backend в `backend/`. Но все shared-типы должны быть вынесены так, чтобы frontend и backend использовали одинаковые DTO.

---

## 3. Функциональный состав MVP

### 3.1. Главный экран расширения

Экран должен соответствовать UI-референсу:

- светлый фон;
- белые карточки;
- крупные красные CTA-кнопки;
- скругления;
- мягкие тени;
- заголовок **AI Тьютор**;
- переключатель состояния **«Расширение активно»**;
- три главных раздела:
  - **Персональный план**;
  - **Мини-квизы**;
  - **Практические кейсы**;
- блок **«Считать текущий прогресс»**;
- дисклеймер внизу.

Основные состояния:

1. Расширение активно, но прогресс не считан.
2. Прогресс считан успешно.
3. Страница LMS не поддерживается.
4. Расширение заблокировано на странице теста.
5. Backend недоступен.

### 3.2. Персональный план обучения

#### 3.2.1. Пользовательский flow

1. Студент открывает Synergy LMS.
2. Открывает расширение.
3. Нажимает **«Персональный план»**.
4. Нажимает **«Считать текущий прогресс»**.
5. Content script парсит DOM LMS и возвращает обезличенный `LmsSnapshot`.
6. Пользователь заполняет форму:
   - сколько часов в неделю может учиться;
   - какие дни недели подходят;
   - проходит дисциплины последовательно или хаотично;
   - предпочитает короткие или длинные сессии.
7. Кнопка **«Сформировать персональный план»** становится активной.
8. Frontend отправляет данные на backend.
9. Backend формирует LLM-запрос и возвращает структурированный план.
10. UI показывает:
   - **Общий прогноз**;
   - **Календарь действий**;
   - **Что делать сегодня?**;
   - **Твой прогресс**;
   - кнопки **«Скачать план»** и **«Пересчитать»**.

#### 3.2.2. Правило блокировки кнопки

Кнопка **«Сформировать персональный план»** должна быть неактивна, пока:

- прогресс не считан;
- `LmsSnapshot` пустой;
- пользователь не указал часы в неделю;
- пользователь не выбрал хотя бы один день недели;
- не выбрана стратегия прохождения;
- не выбрана длительность сессий.

#### 3.2.3. Экспорт плана

Реализовать кнопку **«Скачать план»**:

- обязательный формат: `.md`;
- желательный формат: `.pdf`;
- файл должен называться безопасно, например: `ai-tutor-plan-YYYY-MM-DD.md`;
- экспорт не должен отправлять данные на сторонние сервисы.

### 3.3. Мини-квизы

#### 3.3.1. Пользовательский flow

1. Студент скачивает лекцию из LMS в PDF.
2. Открывает расширение.
3. Нажимает **«Мини-квизы»**.
4. Загружает PDF-файл.
5. Расширение дополнительно отправляет обезличенный контекст из DOM:
   - специальность;
   - курс;
   - название дисциплины, если доступно;
   - название темы, если доступно.
6. Backend извлекает текст из PDF.
7. Backend генерирует:
   - краткое саммари лекции;
   - 2–4 ключевые концепции;
   - 5 открытых вопросов;
   - критерии хорошего ответа к каждому вопросу.
8. UI показывает саммари и первый/текущий вопрос.
9. Студент вводит ответ.
10. Нажимает **«Проверить»**.
11. Backend возвращает фидбек по ответу без выдачи «готового правильного ответа».

#### 3.3.2. Ограничения PDF

- Максимальный размер: **10 МБ**.
- Принимать только `application/pdf`.
- Поддерживать только текстовые PDF.
- Если текст не извлечен или извлечено слишком мало текста — вернуть ошибку:
  **«Файл не поддерживается. Загрузите текстовую лекцию.»**
- Не хранить PDF после обработки.

#### 3.3.3. Формат вопросов

Запрещено:

- варианты A/B/C/D;
- «выберите правильный ответ»;
- прямые ответы на официальные тесты;
- вопросы, явно повторяющие LMS-тесты;
- готовые формулировки для сдачи.

Разрешено:

- открытые вопросы;
- рефлексивные вопросы;
- практико-ориентированные вопросы;
- вопросы на объяснение своими словами;
- критерии хорошего ответа.

### 3.4. Практические кейсы

#### 3.4.1. Пользовательский flow

1. Студент открывает раздел **«Практические кейсы»**.
2. Загружает PDF лекции.
3. Нажимает **«Сгенерировать кейс»**.
4. Backend извлекает текст и определяет тип дисциплины:
   - гуманитарная;
   - техническая;
   - управленческая.
5. Backend выбирает формат:
   - техническая специальность 3+ курс: **чек-лист с пропусками**;
   - управленческая специальность: **мини-симуляция**;
   - гуманитарная специальность или 1–2 курс: **рефлексия по опыту**.
6. UI показывает кейс и интерактивные поля.
7. Студент заполняет ответ.
8. Нажимает **«Получить фидбек»**.
9. Backend возвращает фидбек и критерии хорошего ответа.

#### 3.4.2. Пример UI-состояния

Кейс в формате мини-симуляции:

```text
Мини-симуляция
Вы — CMO стартапа

У вас бюджет 100 000 ₽ на месяц.
Распределите его между каналами:

Таргет ВК: ____ ₽
Email-маркетинг: ____ ₽
Контент: ____ ₽

[Получить фидбек]
[Новый кейс]
```

#### 3.4.3. Фидбек по кейсу

Фидбек должен:

- поддерживать студента;
- указывать, что учтено хорошо;
- мягко обозначать, что стоит раскрыть подробнее;
- не давать единственно правильный ответ;
- показывать критерии хорошего ответа.

---

## 4. UI/UX требования

### 4.1. Визуальный стиль

Использовать дизайн-систему, близкую к референсу UI/UX AI-тьютора:

```css
:root {
  --ai-bg: #f6f6f7;
  --ai-surface: #ffffff;
  --ai-surface-muted: #f2f3f5;
  --ai-primary: #ff3733;
  --ai-primary-hover: #ef2c29;
  --ai-primary-soft: #ffe7e6;
  --ai-text: #101421;
  --ai-text-muted: #7b8190;
  --ai-border: #e2e4ea;
  --ai-success: #22a857;
  --ai-warning: #f59e0b;
  --ai-danger: #ef4444;
  --ai-radius-sm: 10px;
  --ai-radius-md: 16px;
  --ai-radius-lg: 22px;
  --ai-shadow-card: 0 8px 28px rgba(16, 20, 33, 0.08);
}
```

Общие правила:

- ширина popup/панели: 360–420 px;
- минимальная высота экрана: 600 px;
- интерфейс должен скроллиться внутри панели;
- кнопки крупные, кликабельные;
- активный раздел подсвечивается красным или красной обводкой;
- ошибки показываются в карточке с мягкой красной заливкой;
- успешные состояния — зеленый check + текст;
- загрузка — progress bar или spinner.

### 4.2. Компоненты UI

Реализовать компоненты:

```text
src/ui/components/
├── AppShell.tsx
├── Header.tsx
├── ToggleStatus.tsx
├── MainNav.tsx
├── NavButton.tsx
├── Card.tsx
├── Button.tsx
├── TextInput.tsx
├── NumberInput.tsx
├── Select.tsx
├── Checkbox.tsx
├── RadioCard.tsx
├── FileUpload.tsx
├── ProgressBar.tsx
├── StatusBadge.tsx
├── Disclaimer.tsx
├── MarkdownRenderer.tsx
└── ErrorState.tsx
```

### 4.3. Обязательные экраны и состояния

Реализовать минимум 10 UI-состояний, соответствующих референсу:

1. **Главный экран / готовое состояние**
   - три раздела;
   - кнопка считывания прогресса;
   - дисклеймер.

2. **Персональный план / начальное состояние**
   - прогресс не считан;
   - форма доступна, но CTA disabled;
   - подсказка: «Сначала считайте текущий прогресс».

3. **Персональный план / прогресс загружен**
   - выбранные дни;
   - заполненные параметры;
   - CTA active.

4. **Персональный план / результат**
   - общий прогноз;
   - календарь действий;
   - что делать сегодня;
   - твой прогресс;
   - скачать план / пересчитать.

5. **Мини-квизы / пустая загрузка PDF**
   - upload-зона;
   - ограничения PDF;
   - skeleton summary.

6. **Мини-квизы / анализ PDF**
   - файл загружен;
   - progress bar;
   - кнопка проверки disabled.

7. **Мини-квизы / активный вопрос**
   - summary;
   - вопрос 2 из 5;
   - textarea;
   - проверить / пропустить.

8. **Практические кейсы / пустая загрузка PDF**
   - upload-зона;
   - CTA «Сгенерировать кейс» disabled до загрузки PDF.

9. **Практические кейсы / активный кейс**
   - статус «Готово»;
   - описание кейса;
   - поля ответа;
   - получить фидбек / новый кейс.

10. **Практические кейсы / фидбек**
   - карточка фидбека;
   - критерии хорошего ответа;
   - новый кейс / попробовать еще раз.

### 4.4. Дисклеймер

Компонент `Disclaimer` должен присутствовать внутри каждого раздела и подраздела.

Текст строго:

```text
Вы используете AI-тьютор добровольно. Ответственность за сдачу дисциплин — ваша.
```

---

## 5. Архитектура frontend

### 5.1. Основные модули

```text
apps/extension/src/
├── api/
│   ├── client.ts
│   ├── endpoints.ts
│   └── errors.ts
├── content/
│   ├── index.ts
│   ├── lmsDetector.ts
│   ├── domParser.ts
│   ├── testPageGuard.ts
│   └── fixtures/
├── messaging/
│   ├── messages.ts
│   └── handlers.ts
├── storage/
│   ├── extensionStorage.ts
│   └── keys.ts
├── types/
│   └── local.ts
├── ui/
│   ├── App.tsx
│   ├── routes.ts
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── PersonalPlanScreen.tsx
│   │   ├── MiniQuizScreen.tsx
│   │   └── PracticalCaseScreen.tsx
│   ├── components/
│   └── styles/
└── utils/
    ├── download.ts
    ├── formatters.ts
    └── guards.ts
```

### 5.2. Content script

Content script отвечает только за чтение страницы.

#### Обязательные функции

```ts
export function detectSynergyLms(): boolean;
export function detectForbiddenTestPage(): ForbiddenPageDetection;
export function parseLmsSnapshot(): LmsSnapshot;
export function parseStudentContext(): StudentContext;
export function parseCourseProgress(): CourseProgress;
```

#### Нельзя делать

- Нельзя нажимать кнопки LMS.
- Нельзя отправлять формы LMS.
- Нельзя менять статусы LMS.
- Нельзя скрывать элементы LMS.
- Нельзя вставлять ответы в поля LMS.
- Нельзя обходить защиту LMS.

### 5.3. Определение запрещенных страниц

Реализовать `testPageGuard.ts`.

Страница считается запрещенной, если выполняется хотя бы одно условие:

- URL содержит один из паттернов:
  - `test`
  - `exam`
  - `final`
  - `control`
  - `competenc`
  - `assessment`
  - `quiz/official`
- В DOM есть текстовые маркеры:
  - `Итоговый тест`
  - `Компетентностный тест`
  - `Контрольное тестирование`
  - `Промежуточная аттестация`
  - `Начать тестирование`
  - `Завершить тест`
- На странице есть форма с вариантами ответа и кнопкой отправки теста.

Если страница запрещена:

- расширение должно показать экран блокировки;
- функции AI должны быть недоступны;
- текст блокировки:

```text
AI-тьютор недоступен на страницах официальных тестов.
Расширение помогает учиться, но не подсказывает ответы для сдачи.
```

### 5.4. DOM parser LMS

DOM Synergy LMS может изменяться. Поэтому парсер должен быть устойчивым:

- использовать несколько selector fallback;
- парсить видимый текст;
- нормализовать пробелы;
- не падать при отсутствии полей;
- возвращать `null` или пустые массивы, если данные не найдены;
- покрыть парсер unit-тестами на HTML fixtures.

#### Целевая модель `LmsSnapshot`

```ts
export type LmsSnapshot = {
  source: 'synergy_lms';
  capturedAt: string;
  pageUrl: string;
  isSupportedPage: boolean;
  isForbiddenTestPage: boolean;
  studentContext: StudentContext;
  disciplines: Discipline[];
  progress: CourseProgress;
  rawTextHash?: string;
};

export type StudentContext = {
  specialty?: string;
  course?: string;
  educationLevel?: string;
  currentDisciplineTitle?: string;
  currentTopicTitle?: string;
};

export type Discipline = {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'unknown';
  deadline?: string;
  topics: Topic[];
};

export type Topic = {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'unknown';
  estimatedComplexity?: 'low' | 'medium' | 'high';
};

export type CourseProgress = {
  totalDisciplines: number;
  completedDisciplines: number;
  totalTopics: number;
  completedTopics: number;
  percent?: number;
  sessionEndDate?: string;
};

export type ForbiddenPageDetection = {
  isForbidden: boolean;
  reasons: string[];
};
```

### 5.5. Messaging

Расширение должно запрашивать snapshot через message bus.

```ts
export type ExtensionMessage =
  | { type: 'AI_TUTOR_GET_LMS_SNAPSHOT' }
  | { type: 'AI_TUTOR_GET_PAGE_STATUS' };

export type ExtensionMessageResponse =
  | { ok: true; data: LmsSnapshot }
  | { ok: false; error: string; details?: unknown };
```

### 5.6. API client frontend

`src/api/client.ts` должен:

- брать base URL из env:
  - `PLASMO_PUBLIC_API_BASE_URL=http://localhost:8787`;
- валидировать ответы через shared schemas;
- нормально обрабатывать ошибки:
  - network error;
  - validation error;
  - backend error;
  - PDF too large;
  - unsupported PDF;
  - forbidden page.

---

## 6. Архитектура backend

### 6.1. Структура backend

```text
apps/backend/src/
├── app.ts
├── server.ts
├── config/
│   └── env.ts
├── routes/
│   ├── health.routes.ts
│   ├── plan.routes.ts
│   ├── quiz.routes.ts
│   └── case.routes.ts
├── services/
│   ├── llm.service.ts
│   ├── pdf.service.ts
│   ├── plan.service.ts
│   ├── quiz.service.ts
│   ├── case.service.ts
│   └── safety.service.ts
├── prompts/
│   ├── plan.prompt.ts
│   ├── quiz.prompt.ts
│   ├── quizFeedback.prompt.ts
│   ├── case.prompt.ts
│   └── caseFeedback.prompt.ts
├── schemas/
│   └── api.schemas.ts
├── types/
│   └── internal.ts
└── utils/
    ├── errors.ts
    ├── text.ts
    └── logger.ts
```

### 6.2. Конфигурация backend

`.env.example`:

```env
NODE_ENV=development
PORT=8787
HOST=0.0.0.0
OPENAI_API_KEY=replace_me
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TEMPERATURE=0.3
CORS_ORIGIN=http://localhost:1815,chrome-extension://*
MAX_PDF_SIZE_MB=10
RATE_LIMIT_MAX=60
RATE_LIMIT_WINDOW=1 minute
LOG_LEVEL=info
```

### 6.3. API endpoints

#### `GET /health`

Ответ:

```json
{
  "ok": true,
  "service": "ai-tutor-backend",
  "version": "0.1.0"
}
```

#### `POST /api/plan/generate`

Назначение: генерация персонального плана.

Request JSON:

```ts
export type GeneratePlanRequest = {
  lmsSnapshot: LmsSnapshot;
  preferences: PlanPreferences;
};

export type PlanPreferences = {
  hoursPerWeek: number;
  availableDays: WeekDay[];
  strategy: 'sequential' | 'chaotic';
  sessionDuration: 'short_30_min' | 'long_90_min';
  allowWeekends?: boolean;
};

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
```

Response JSON:

```ts
export type GeneratePlanResponse = {
  forecast: {
    status: 'on_track' | 'at_risk';
    message: string;
    sessionEndDate?: string;
    requiredExtraHoursPerWeek?: number;
    suggestedExtraDays?: WeekDay[];
  };
  calendar: Array<{
    date: string;
    action: string;
    time: string;
  }>;
  today: {
    date: string;
    title: string;
    actions: string[];
  };
  progress: {
    daysLeft?: number;
    completedTopics: number;
    totalTopics: number;
    message: string;
  };
  markdown: string;
};
```

#### `POST /api/quiz/generate`

Назначение: загрузка PDF и генерация мини-квиза.

Request: `multipart/form-data`

Поля:

- `file`: PDF;
- `context`: JSON string `QuizContext`.

```ts
export type QuizContext = {
  studentContext: StudentContext;
  lmsSnapshot?: Pick<LmsSnapshot, 'progress' | 'studentContext'>;
};
```

Response JSON:

```ts
export type GenerateQuizResponse = {
  lecture: {
    title?: string;
    summary: string;
    keyConcepts: Array<{
      title: string;
      explanation: string;
      example?: string;
    }>;
  };
  questions: Array<{
    id: string;
    type: 'open';
    question: string;
    intent: 'understanding' | 'practice' | 'reflection';
    goodAnswerCriteria: string[];
  }>;
};
```

#### `POST /api/quiz/feedback`

Назначение: фидбек на открытый ответ студента.

Request JSON:

```ts
export type QuizFeedbackRequest = {
  question: {
    id: string;
    question: string;
    goodAnswerCriteria: string[];
  };
  studentAnswer: string;
  lectureSummary?: string;
  studentContext?: StudentContext;
};
```

Response JSON:

```ts
export type FeedbackResponse = {
  tone: 'supportive';
  summary: string;
  strengths: string[];
  improve: string[];
  criteriaChecklist: Array<{
    criterion: string;
    status: 'covered' | 'partially_covered' | 'missing';
  }>;
  nextStep?: string;
};
```

#### `POST /api/case/generate`

Назначение: загрузка PDF и генерация практического кейса.

Request: `multipart/form-data`

Поля:

- `file`: PDF;
- `context`: JSON string `CaseContext`.

```ts
export type CaseContext = {
  studentContext: StudentContext;
  lmsSnapshot?: Pick<LmsSnapshot, 'progress' | 'studentContext'>;
};
```

Response JSON:

```ts
export type GenerateCaseResponse = {
  disciplineType: 'humanitarian' | 'technical' | 'management';
  caseFormat: 'gap_checklist' | 'mini_simulation' | 'experience_reflection';
  title: string;
  role?: string;
  scenario: string;
  fields: Array<{
    id: string;
    label: string;
    inputType: 'text' | 'textarea' | 'number' | 'money';
    placeholder?: string;
    unit?: string;
    required: boolean;
  }>;
  goodAnswerCriteria: string[];
};
```

#### `POST /api/case/feedback`

Назначение: фидбек по ответу на практический кейс.

Request JSON:

```ts
export type CaseFeedbackRequest = {
  caseData: GenerateCaseResponse;
  answers: Record<string, string | number>;
  studentContext?: StudentContext;
};
```

Response: `FeedbackResponse`.

### 6.4. Единый формат ошибки API

```ts
export type ApiErrorResponse = {
  ok: false;
  error: {
    code:
      | 'VALIDATION_ERROR'
      | 'PDF_TOO_LARGE'
      | 'UNSUPPORTED_PDF'
      | 'PDF_TEXT_EMPTY'
      | 'LLM_ERROR'
      | 'SAFETY_BLOCKED'
      | 'RATE_LIMITED'
      | 'INTERNAL_ERROR';
    message: string;
    details?: unknown;
  };
};
```

Пример:

```json
{
  "ok": false,
  "error": {
    "code": "PDF_TEXT_EMPTY",
    "message": "Файл не поддерживается. Загрузите текстовую лекцию."
  }
}
```

---

## 7. LLM и промпты

### 7.1. Общие требования к LLM

- Backend должен возвращать **структурированный JSON**, а не свободный текст.
- Для Markdown-плана backend дополнительно формирует поле `markdown`.
- Все LLM-вызовы должны проходить через `llm.service.ts`.
- Промпты должны лежать в отдельных файлах в `src/prompts`.
- В промптах обязательно указывать правила академической честности.
- При ошибке JSON parse выполнить одну попытку repair/retry.
- Температура по умолчанию: `0.3`.

### 7.2. Safety system prompt

Каждый LLM-вызов должен содержать общий system prompt:

```text
Ты — AI-тьютор для дистанционного обучения. Твоя задача — помогать студенту понимать материал, планировать учебу и тренироваться на открытых заданиях.

Строгие ограничения:
- не подсказывай ответы на официальные тесты;
- не генерируй варианты A/B/C/D;
- не давай готовые формулировки для сдачи;
- не утверждай, что студент гарантированно сдаст дисциплину;
- не делай действия от имени студента;
- объясняй спокойно, поддерживающе и без давления;
- возвращай только валидный JSON по заданной схеме.
```

### 7.3. План обучения

План должен включать:

- общий прогноз;
- календарь действий;
- что делать сегодня;
- прогресс;
- markdown-версию.

Правила:

- не добавлять колонку `Статус` в календарь;
- в календаре использовать колонки `Дата`, `Что делать?`, `Время`;
- если студент не успевает, предложить увеличение часов или дополнительные дни;
- тон — спокойный, поддерживающий.

### 7.4. Мини-квизы

Backend должен генерировать:

- summary: 3–5 предложений;
- 2–4 ключевые концепции;
- 5 открытых вопросов;
- критерии хорошего ответа к каждому вопросу.

Минимум один вопрос должен быть практико-ориентированным. Минимум один — рефлексивным.

### 7.5. Практические кейсы

Backend должен определить тип дисциплины и формат задания.

Формат выбирается так:

```ts
if (technical && course >= 3) caseFormat = 'gap_checklist';
else if (management) caseFormat = 'mini_simulation';
else caseFormat = 'experience_reflection';
```

Если курс не определен, использовать наиболее безопасный формат: `experience_reflection`, кроме случаев, когда лекция явно управленческая.

---

## 8. Валидация, безопасность и приватность

### 8.1. Данные

Запрещено отправлять на backend:

- ФИО студента;
- email;
- телефон;
- номер договора;
- внутренние ID пользователя LMS;
- cookie;
- access token;
- session token;
- полные HTML-страницы;
- скриншоты LMS.

Можно отправлять:

- названия дисциплин;
- названия тем;
- статусы прохождения;
- дедлайны;
- обезличенную специальность;
- курс;
- текст загруженного пользователем PDF.

### 8.2. Анонимизация

Frontend перед отправкой должен прогнать текстовые поля через функцию `anonymizeText`.

Минимум удалить/замаскировать:

- email;
- телефон;
- длинные числовые ID от 7 цифр;
- URL с query-параметрами;
- вероятные ФИО, если они найдены рядом с маркерами `ФИО`, `Студент`, `Обучающийся`.

### 8.3. Backend hardening

Реализовать:

- CORS whitelist через env;
- rate limit;
- PDF size limit;
- MIME validation;
- request timeout;
- безопасные ошибки без stack trace наружу;
- логирование без учебного текста и без PDF;
- `helmet` опционально, если используется Fastify-compatible plugin.

### 8.4. Запрет на официальные тесты

Если frontend обнаружил запрещенную страницу, он не должен вызывать backend для генерации.

Если backend получает запрос с `isForbiddenTestPage=true`, он должен вернуть:

```json
{
  "ok": false,
  "error": {
    "code": "SAFETY_BLOCKED",
    "message": "AI-тьютор недоступен на страницах официальных тестов."
  }
}
```

---

## 9. Локальное хранение

Использовать `chrome.storage.local`.

Ключи:

```ts
export const STORAGE_KEYS = {
  extensionEnabled: 'aiTutor.extensionEnabled',
  lastLmsSnapshot: 'aiTutor.lastLmsSnapshot',
  lastPlan: 'aiTutor.lastPlan',
  lastQuiz: 'aiTutor.lastQuiz',
  lastCase: 'aiTutor.lastCase',
  userPreferences: 'aiTutor.userPreferences'
} as const;
```

Не хранить:

- PDF-файлы;
- полный текст лекции;
- ответы студента без явного действия пользователя;
- персональные данные.

---

## 10. Сценарии ошибок

### 10.1. LMS не открыта

Текст:

```text
Откройте Synergy LMS, чтобы загрузить ваш прогресс.
```

CTA `Считать текущий прогресс` должен быть доступен, но при ошибке показывать explanation.

### 10.2. Страница не поддерживается

```text
Не удалось определить структуру LMS на этой странице.
Перейдите на страницу дисциплины или учебного плана и попробуйте снова.
```

### 10.3. Официальный тест

```text
AI-тьютор недоступен на страницах официальных тестов.
Расширение помогает учиться, но не подсказывает ответы для сдачи.
```

### 10.4. Backend недоступен

```text
Сервис AI-тьютора временно недоступен.
Проверьте подключение или попробуйте позже.
```

### 10.5. PDF не поддерживается

```text
Файл не поддерживается. Загрузите текстовую лекцию.
```

### 10.6. PDF больше 10 МБ

```text
Файл слишком большой. Максимальный размер PDF — 10 МБ.
```

---

## 11. Тестирование

### 11.1. Unit tests frontend

Покрыть:

- `detectForbiddenTestPage`;
- `parseLmsSnapshot` на HTML fixtures;
- `anonymizeText`;
- validators DTO;
- disabled/enabled logic для кнопок;
- API error mapping.

### 11.2. Unit tests backend

Покрыть:

- PDF size validation;
- MIME validation;
- empty PDF text error;
- zod schemas;
- safety blocked behavior;
- LLM JSON parse / repair;
- prompt builders.

### 11.3. Integration tests backend

Покрыть endpoints:

- `GET /health`;
- `POST /api/plan/generate` with mocked LLM;
- `POST /api/quiz/generate` with fixture PDF;
- `POST /api/quiz/feedback` with mocked LLM;
- `POST /api/case/generate` with fixture PDF;
- `POST /api/case/feedback` with mocked LLM.

### 11.4. Manual QA checklist

1. Расширение собирается через `pnpm build`.
2. Папка `build/chrome` загружается в `chrome://extensions`.
3. На обычной странице LMS открывается popup AI-тьютора.
4. На странице итогового теста AI-функции заблокированы.
5. Считывание прогресса не изменяет LMS.
6. Персональный план генерируется и отображается.
7. Мини-квиз принимает PDF до 10 МБ.
8. Сканированный PDF возвращает понятную ошибку.
9. Практический кейс генерируется по лекции.
10. Фидбек не содержит готового ответа для сдачи.
11. Дисклеймер виден во всех разделах.
12. При выключении toggle AI-функции недоступны.

---

## 12. Команды разработки

### 12.1. Корневой `package.json`

Добавить scripts:

```json
{
  "scripts": {
    "dev": "pnpm -r dev",
    "dev:extension": "pnpm --filter @ai-tutor/extension dev",
    "dev:backend": "pnpm --filter @ai-tutor/backend dev",
    "build": "pnpm -r build",
    "build:extension": "pnpm --filter @ai-tutor/extension build",
    "build:backend": "pnpm --filter @ai-tutor/backend build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  }
}
```

### 12.2. Backend scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

### 12.3. Extension scripts

```json
{
  "scripts": {
    "dev": "plasmo dev",
    "build": "plasmo build",
    "package": "plasmo package",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 13. Порядок реализации для Codex

Codex должен выполнять разработку по этапам.

### Этап 1. Подготовка структуры

1. Проверить текущий репозиторий.
2. Не ломать существующий Plasmo build.
3. Добавить backend и shared-типы.
4. Настроить pnpm workspace, если его нет.
5. Добавить `.env.example`.
6. Добавить README-инструкции для запуска frontend + backend.

### Этап 2. Shared DTO

1. Создать shared package или shared folder.
2. Описать типы:
   - `LmsSnapshot`;
   - `StudentContext`;
   - `Discipline`;
   - `Topic`;
   - `GeneratePlanRequest/Response`;
   - `GenerateQuizResponse`;
   - `GenerateCaseResponse`;
   - `FeedbackResponse`;
   - `ApiErrorResponse`.
3. Добавить zod schemas.

### Этап 3. Backend MVP

1. Поднять Fastify app.
2. Реализовать `/health`.
3. Реализовать PDF service.
4. Реализовать LLM service.
5. Реализовать safety service.
6. Реализовать endpoints:
   - `/api/plan/generate`;
   - `/api/quiz/generate`;
   - `/api/quiz/feedback`;
   - `/api/case/generate`;
   - `/api/case/feedback`.
7. Покрыть tests с mocked LLM.

### Этап 4. Frontend shell

1. Реализовать `AppShell`, `Header`, `MainNav`, `Disclaimer`.
2. Реализовать UI tokens.
3. Сделать три раздела.
4. Реализовать disabled state при выключенном toggle.
5. Сохранение toggle в `chrome.storage.local`.

### Этап 5. DOM parsing и safety guard

1. Реализовать `lmsDetector`.
2. Реализовать `testPageGuard`.
3. Реализовать `domParser`.
4. Настроить messaging.
5. Покрыть fixture tests.

### Этап 6. Персональный план

1. Экран формы.
2. Считывание snapshot.
3. Валидация формы.
4. Вызов backend.
5. Рендер результата.
6. Экспорт markdown.
7. Сохранение последнего плана локально.

### Этап 7. Мини-квизы

1. Upload PDF.
2. Client-side validation PDF.
3. Processing state.
4. Вызов backend.
5. Рендер summary и вопросов.
6. Ответ студента.
7. Фидбек по ответу.
8. Состояние «пропустить вопрос».

### Этап 8. Практические кейсы

1. Upload PDF.
2. Generate case.
3. Dynamic fields renderer.
4. Feedback request.
5. Feedback result screen.
6. New case / retry actions.

### Этап 9. Полировка

1. Проверить соответствие 10 UI-состояниям.
2. Проверить дисклеймер во всех разделах.
3. Проверить ошибки.
4. Проверить read-only behavior.
5. Проверить сборку.
6. Обновить README.

---

## 14. Acceptance criteria

Задача считается выполненной, если:

- [ ] Проект запускается локально одной инструкцией из README.
- [ ] Backend стартует на `localhost:8787`.
- [ ] Extension собирается Plasmo build без ошибок.
- [ ] UI соответствует референсу по структуре и визуальной логике.
- [ ] Главный экран содержит 3 раздела и toggle активности.
- [ ] Персональный план работает от считывания DOM до результата.
- [ ] Мини-квиз генерируется из текстового PDF.
- [ ] Практический кейс генерируется из текстового PDF.
- [ ] Фидбек возвращается по квизу и кейсу.
- [ ] PDF больше 10 МБ блокируется.
- [ ] Сканированный/пустой PDF возвращает корректную ошибку.
- [ ] На официальных тестах расширение блокирует AI-функции.
- [ ] Расширение не изменяет LMS и не выполняет действия от имени студента.
- [ ] Все API DTO валидируются.
- [ ] Есть tests для критичных функций.
- [ ] В каждом разделе есть дисклеймер.
- [ ] README обновлен с инструкциями запуска frontend/backend.

---

## 15. Что не входит в MVP

Не реализовывать в первой версии:

- авторизацию пользователей;
- личный кабинет;
- облачное хранение истории;
- оплату;
- админ-панель;
- синхронизацию с календарем;
- изменение LMS;
- автопрохождение тестов;
- получение ответов из LMS;
- обход ограничений LMS;
- OCR для сканов PDF;
- мобильное приложение.

---

## 16. Минимальные мок-данные для разработки UI

Пока реальная LMS недоступна, использовать mock snapshot:

```ts
export const mockLmsSnapshot: LmsSnapshot = {
  source: 'synergy_lms',
  capturedAt: new Date().toISOString(),
  pageUrl: 'https://lms.synergy.ru/student/course/marketing',
  isSupportedPage: true,
  isForbiddenTestPage: false,
  studentContext: {
    specialty: 'Маркетинг',
    course: '3 курс',
    educationLevel: 'бакалавриат',
    currentDisciplineTitle: 'Маркетинг',
    currentTopicTitle: 'Маркетинговая воронка'
  },
  disciplines: [
    {
      id: 'discipline-1',
      title: 'Маркетинг',
      status: 'in_progress',
      deadline: '2026-06-30',
      topics: [
        { id: 'topic-1', title: 'Маркетинговая воронка', status: 'completed', estimatedComplexity: 'medium' },
        { id: 'topic-2', title: 'Каналы продвижения', status: 'in_progress', estimatedComplexity: 'medium' },
        { id: 'topic-3', title: 'Unit-экономика', status: 'not_started', estimatedComplexity: 'high' }
      ]
    }
  ],
  progress: {
    totalDisciplines: 1,
    completedDisciplines: 0,
    totalTopics: 3,
    completedTopics: 1,
    percent: 33,
    sessionEndDate: '2026-06-30'
  }
};
```

---

## 17. Финальное требование к Codex

Codex должен не просто создать отдельные файлы, а довести проект до состояния, в котором:

1. frontend и backend типизированы;
2. основные сценарии работают end-to-end;
3. код разбит на понятные модули;
4. LLM-вызовы изолированы в backend;
5. расширение остается read-only;
6. академическая честность enforced на уровне UI, content script и backend;
7. README позволяет новому разработчику поднять проект локально без дополнительных пояснений.

