# AI Тьютор для Synergy LMS

MVP браузерного расширения Chrome Manifest V3 и backend-сервиса для read-only AI-тьютора в Synergy LMS.

## Что реализовано

- Plasmo popup на React + TypeScript.
- Fastify backend на `localhost:8787`.
- Shared DTO и zod-схемы в `packages/shared`.
- Read-only считывание обезличенного LMS-контекста.
- Safety guard для страниц официальных тестов.
- Персональный план с экспортом в Markdown.
- Генерация мини-квизов из текстового PDF до 10 МБ.
- Генерация практического кейса из текстового PDF.
- Фидбек по ответам без готовых ответов для сдачи.
- Mock LLM режим: продукт работает локально без `OPENAI_API_KEY`.

## Быстрый старт

```bash
pnpm install
pnpm dev:backend
pnpm dev:extension
```

Backend будет доступен на:

```text
http://localhost:8787
```

Расширение в dev-режиме собирается Plasmo. Для загрузки в Chrome используйте папку сборки Plasmo из `apps/extension/build/chrome-mv3-dev` или production build:

```bash
pnpm build:extension
```

## Настройка LLM

Backend поддерживает три режима:

- `LLM_PROVIDER=mock` — локальные заготовленные ответы, без AI.
- `LLM_PROVIDER=ollama` — локальная модель через Ollama.
- `LLM_PROVIDER=openai` — OpenAI API.

### Локальная Llama/Ollama

Проверьте установленные модели:

```bash
ollama list
```

В текущей среде обнаружена модель:

```text
qwen3-coder:30b
```

Она уже указана в `.env` и `.env.example`:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3-coder:30b
```

Если хотите использовать именно Llama-модель, установите её в Ollama и замените `OLLAMA_MODEL`:

```bash
ollama pull llama3.1:8b
```

```env
OLLAMA_MODEL=llama3.1:8b
```

Ollama должна быть запущена локально. Обычно достаточно:

```bash
ollama serve
```

Если Ollama уже запущена как приложение/служба, отдельный `ollama serve` не нужен.

Скопируйте `.env.example` в `.env` и укажите ключ:

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
LLM_MOCK=false
```

Для OpenAI укажите:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

Если нужен режим без внешнего AI:

```env
LLM_PROVIDER=mock
LLM_MOCK=true
```

## Команды

```bash
pnpm dev
pnpm build
pnpm test
pnpm typecheck
pnpm dev:backend
pnpm dev:extension
```

## Структура

```text
apps/
  backend/     Fastify API, PDF extraction, LLM facade, safety
  extension/   Plasmo extension popup, content helpers, UI
packages/
  shared/      DTO, zod schemas, mock LMS snapshot
```

## Safety и приватность

Расширение не кликает по LMS, не отправляет формы и не меняет DOM LMS. На страницах итоговых и компетентностных тестов AI-функции блокируются. Перед отправкой учебного контекста текстовые поля анонимизируются: email, телефоны, длинные ID, URL с query-параметрами и вероятные ФИО рядом с маркерами.

PDF-файлы не сохраняются. Backend извлекает текст из файла в памяти, отправляет его в LLM-сервис и не пишет учебный контент в логи.

## Проверка

```bash
pnpm typecheck
pnpm test
pnpm build
```

Ручной smoke test:

1. Запустить backend.
2. Запустить Plasmo extension.
3. Открыть Synergy LMS или любую тестовую страницу.
4. Открыть popup AI Тьютора.
5. Считать прогресс, сформировать план, скачать `.md`.
6. Загрузить текстовый PDF в мини-квиз и практический кейс.
7. Проверить, что на странице с текстом `Итоговый тест` генерация блокируется.
