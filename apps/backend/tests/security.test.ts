import { describe, expect, it, vi } from "vitest"
import { mockLmsSnapshot } from "@ai-tutor/shared"

const payload = {
  snapshot: mockLmsSnapshot,
  preferences: {
    hoursPerWeek: 6,
    availableDays: ["Пн", "Ср"],
    strategy: "sequential",
    sessionDuration: "long"
  }
}

describe("api security", () => {
  it("uses per-user access tokens and per-user limits", async () => {
    vi.resetModules()
    vi.stubEnv("LLM_MOCK", "true")
    vi.stubEnv("LLM_PROVIDER", "mock")
    vi.stubEnv("API_TOKEN", "legacy-token-for-tests")
    vi.stubEnv("AI_ACCESS_TOKENS", JSON.stringify([
      { id: "pilot-a", token: "pilot-a-token-123456", hourlyLimit: 1, dailyLimit: 1 },
      { id: "pilot-b", token: "pilot-b-token-123456", hourlyLimit: 2, dailyLimit: 2 }
    ]))

    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()

    const first = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      headers: { "x-ai-tutor-user-token": "pilot-a-token-123456" },
      payload
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      headers: { "x-ai-tutor-user-token": "pilot-a-token-123456" },
      payload
    })
    expect(second.statusCode).toBe(429)
    expect(second.json().error.code).toBe("RATE_LIMITED")

    const otherUser = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      headers: { "x-ai-tutor-user-token": "pilot-b-token-123456" },
      payload
    })
    expect(otherUser.statusCode).toBe(200)
    await app.close()
  }, 30_000)

  it("can revoke access through the admin endpoint", async () => {
    vi.resetModules()
    vi.stubEnv("LLM_MOCK", "true")
    vi.stubEnv("LLM_PROVIDER", "mock")
    vi.stubEnv("API_TOKEN", "legacy-token-for-tests")
    vi.stubEnv("ADMIN_API_TOKEN", "admin-token-for-tests")
    vi.stubEnv("AI_ACCESS_TOKENS", JSON.stringify([
      { id: "pilot-revoked", token: "pilot-revoke-token-123456", hourlyLimit: 10, dailyLimit: 10 }
    ]))

    const { buildApp } = await import("../src/app.js")
    const app = await buildApp()

    const revoke = await app.inject({
      method: "POST",
      url: "/admin/access/revoke",
      headers: { "x-ai-tutor-admin-token": "admin-token-for-tests" },
      payload: { userId: "pilot-revoked", reason: "test" }
    })
    expect(revoke.statusCode).toBe(200)
    expect(revoke.json().revoked).toHaveLength(1)

    const blocked = await app.inject({
      method: "POST",
      url: "/api/plan/generate",
      headers: { "x-ai-tutor-user-token": "pilot-revoke-token-123456" },
      payload
    })
    expect(blocked.statusCode).toBe(401)
    await app.close()
  }, 30_000)
})
