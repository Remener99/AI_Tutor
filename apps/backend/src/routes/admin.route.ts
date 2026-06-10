import type { FastifyInstance, FastifyRequest } from "fastify"
import { z } from "zod"
import { env } from "../config/env.js"
import {
  getAccessTokens,
  getRuntimeRevokedTokenHashes,
  hashAccessToken,
  isTokenHashRevoked,
  maskHash,
  revokeTokenHash
} from "../services/access-control.service.js"
import { ApiError } from "../utils/errors.js"

const getHeader = (request: FastifyRequest, name: string) => {
  const value = request.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

const assertAdmin = (request: FastifyRequest) => {
  if (!env.ADMIN_API_TOKEN) {
    throw new ApiError("UNAUTHORIZED", "Admin API is disabled.", 404)
  }
  if (getHeader(request, "x-ai-tutor-admin-token") !== env.ADMIN_API_TOKEN) {
    throw new ApiError("UNAUTHORIZED", "Invalid admin token.", 401)
  }
}

const revokeSchema = z.object({
  userId: z.string().optional(),
  token: z.string().optional(),
  tokenHash: z.string().optional(),
  reason: z.string().max(300).optional()
}).refine((value) => value.userId || value.token || value.tokenHash, {
  message: "Provide userId, token or tokenHash"
})

export const registerAdminRoutes = async (app: FastifyInstance) => {
  app.get("/admin/access/tokens", async (request) => {
    assertAdmin(request)
    return {
      ok: true,
      tokens: getAccessTokens().map((token) => ({
        id: token.id,
        label: token.label,
        tokenHash: maskHash(token.tokenHash),
        revoked: token.revoked || isTokenHashRevoked(token.tokenHash),
        hourlyLimit: token.hourlyLimit ?? env.AI_HOURLY_LIMIT,
        dailyLimit: token.dailyLimit ?? env.AI_DAILY_LIMIT
      })),
      runtimeRevokedCount: getRuntimeRevokedTokenHashes().size
    }
  })

  app.post("/admin/access/revoke", async (request) => {
    assertAdmin(request)
    const payload = revokeSchema.parse(request.body)
    const hashes = new Set<string>()

    if (payload.tokenHash) hashes.add(payload.tokenHash)
    if (payload.token) hashes.add(hashAccessToken(payload.token))
    if (payload.userId) {
      getAccessTokens()
        .filter((token) => token.id === payload.userId)
        .forEach((token) => hashes.add(token.tokenHash))
    }

    const revoked = [...hashes].map((hash) => revokeTokenHash(hash))
    app.log.warn({
      event: "access_revoked",
      userId: payload.userId,
      tokenHashes: revoked.map(maskHash),
      reason: payload.reason
    })

    return {
      ok: true,
      revoked: revoked.map(maskHash),
      note: "Runtime revoke is active for this backend instance. Add hashes to AI_REVOKED_TOKEN_HASHES for permanent revoke."
    }
  })
}
