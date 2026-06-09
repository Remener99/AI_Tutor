import { describe, expect, it } from "vitest"
import { assertNotForbidden } from "../src/services/safety.service.js"

describe("safety service", () => {
  it("blocks official test pages", () => {
    expect(() => assertNotForbidden(true)).toThrow("AI-тьютор недоступен")
  })
})
