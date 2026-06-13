# Семпейс AI landing

Статический лендинг для пилотного пакета Семпейс AI.

## Команды

```bash
pnpm --filter @ai-tutor/landing build
pnpm --filter @ai-tutor/landing dev
```

После сборки готовая версия находится в `apps/landing/dist`.

## Скачивание pilot-package

Архив доступен по относительному пути:

```text
/downloads/sempace-ai-pilot-0.1.5.zip
```

Этот файл копируется в `dist` из `apps/landing/public/downloads`.

## Публикация

Для любого static hosting нужно загрузить содержимое папки `apps/landing/dist` как корень сайта. Подойдут Netlify Drop, Vercel, GitHub Pages, S3/Yandex Object Storage или любой обычный веб-сервер.
