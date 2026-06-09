FROM node:22-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/backend apps/backend
COPY packages/shared packages/shared

RUN pnpm --filter @ai-tutor/shared build && pnpm --filter @ai-tutor/backend build

ENV NODE_ENV=production

CMD ["pnpm", "--filter", "@ai-tutor/backend", "start"]
