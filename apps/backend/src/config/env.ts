import { config } from "dotenv"
import { z } from "zod"

config({ path: "../../.env" })
config()

const booleanEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value
  const normalized = value.trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off", ""].includes(normalized)) return false
  return value
}, z.boolean())

const envSchema = z.object({
  BACKEND_PORT: z.coerce.number().default(8787),
  BACKEND_HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("chrome-extension://*,https://*.synergy.ru,http://localhost:1815,http://localhost:1012"),
  API_TOKEN: z.string().optional(),
  AI_HOURLY_LIMIT: z.coerce.number().int().nonnegative().default(80),
  AI_DAILY_LIMIT: z.coerce.number().int().nonnegative().default(300),
  LLM_PROVIDER: z.enum(["mock", "openai", "ollama"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen3-coder:30b"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  TUTOR_CHAT_TIMEOUT_MS: z.coerce.number().int().positive().default(150_000),
  PLAN_LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  LLM_MOCK: booleanEnv.default(false)
})

const rawEnv = {
  ...process.env,
  BACKEND_PORT: process.env.BACKEND_PORT ?? process.env.PORT
}

export const env = envSchema.parse(rawEnv)

export const corsOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
