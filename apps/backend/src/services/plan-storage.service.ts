import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { GeneratePlanResponse, StudentState } from "@ai-tutor/shared"

type StoredPlan = {
  id: string
  createdAt: string
  studentKey: string
  state: StudentState
  plan: GeneratePlanResponse
}

const backendRoot = process.cwd().replace(/\\/g, "/").endsWith("/apps/backend")
  ? process.cwd()
  : join(process.cwd(), "apps", "backend")
const defaultStoragePath = join(backendRoot, "data", "plans.json")
const getStoragePath = () => process.env.PLAN_STORAGE_PATH || defaultStoragePath

const readPlans = async (): Promise<StoredPlan[]> => {
  try {
    const raw = await readFile(getStoragePath(), "utf8")
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const savePlanResult = async (state: StudentState, plan: GeneratePlanResponse) => {
  const plans = await readPlans()
  const createdAt = new Date().toISOString()
  const stored: StoredPlan = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    studentKey: state.student?.specialty || "unknown",
    state,
    plan
  }
  const next = [stored, ...plans].slice(0, 200)
  const storagePath = getStoragePath()
  await mkdir(dirname(storagePath), { recursive: true })
  await writeFile(storagePath, JSON.stringify(next, null, 2), "utf8")
  return stored
}
