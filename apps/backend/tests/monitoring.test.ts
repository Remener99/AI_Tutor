import { describe, expect, it, vi } from "vitest"

describe("monitoring endpoints", () => {
  it("returns status with quota store and metrics", async () => {
    vi.resetModules()
    vi.stubEnv("LLM_MOCK", "true")
    vi.stubEnv("LLM_PROVIDER", "mock")
    vi.stubEnv("ADMIN_API_TOKEN", "admin-monitor-token")

    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "GET",
      url: "/admin/monitoring/status",
      headers: { "x-ai-tutor-admin-token": "admin-monitor-token" }
    })

    const json = response.json()
    expect(response.statusCode).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.quotaStore.ok).toBe(true)
    expect(json.quotaStore.kind).toBe("memory")
    expect(json.http.statusBuckets).toBeTruthy()
    await app.close()
  }, 15_000)

  it("runs AI provider check behind admin auth", async () => {
    vi.resetModules()
    vi.stubEnv("LLM_MOCK", "true")
    vi.stubEnv("LLM_PROVIDER", "mock")
    vi.stubEnv("ADMIN_API_TOKEN", "admin-monitor-token")

    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "POST",
      url: "/admin/monitoring/ai-check",
      headers: { "x-ai-tutor-admin-token": "admin-monitor-token" }
    })

    const json = response.json()
    expect(response.statusCode).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.provider).toBe("mock")
    expect(json.latencyMs).toBeGreaterThanOrEqual(0)
    await app.close()
  }, 15_000)

  it("runs AI provider check over GET for external monitors", async () => {
    vi.resetModules()
    vi.stubEnv("LLM_MOCK", "true")
    vi.stubEnv("LLM_PROVIDER", "mock")
    vi.stubEnv("ADMIN_API_TOKEN", "admin-monitor-token")

    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()
    const response = await app.inject({
      method: "GET",
      url: "/admin/monitoring/ai-check",
      headers: { "x-ai-tutor-admin-token": "admin-monitor-token" }
    })

    const json = response.json()
    expect(response.statusCode).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.provider).toBe("mock")
    await app.close()
  }, 15_000)
})
