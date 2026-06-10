import { createHash, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { env } from "../config/env.js"

export type AccessTokenRecord = {
  id: string
  label?: string
  tokenHash: string
  revoked: boolean
  hourlyLimit?: number
  dailyLimit?: number
}

const accessTokenRecordSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  token: z.string().min(16).optional(),
  tokenHash: z.string().min(32).optional(),
  revoked: z.boolean().default(false),
  hourlyLimit: z.number().int().nonnegative().optional(),
  dailyLimit: z.number().int().nonnegative().optional()
}).refine((value) => value.token || value.tokenHash, {
  message: "Either token or tokenHash is required"
})

const normalizeHash = (value: string) => value.trim().toLowerCase()

export const hashAccessToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex")

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const parseAccessTokens = (): AccessTokenRecord[] => {
  if (!env.AI_ACCESS_TOKENS) return []
  const parsed = z.array(accessTokenRecordSchema).parse(JSON.parse(env.AI_ACCESS_TOKENS))
  return parsed.map((record) => ({
    id: record.id,
    label: record.label,
    tokenHash: normalizeHash(record.tokenHash ?? hashAccessToken(record.token as string)),
    revoked: record.revoked,
    hourlyLimit: record.hourlyLimit,
    dailyLimit: record.dailyLimit
  }))
}

const parseRevokedHashes = () =>
  new Set((env.AI_REVOKED_TOKEN_HASHES ?? "")
    .split(",")
    .map((value) => normalizeHash(value))
    .filter(Boolean))

const accessTokens = parseAccessTokens()
const permanentlyRevokedTokenHashes = parseRevokedHashes()
const runtimeRevokedTokenHashes = new Set<string>()

export const getAccessTokens = () => accessTokens

export const getRuntimeRevokedTokenHashes = () => runtimeRevokedTokenHashes

export const maskHash = (hash: string) => `${hash.slice(0, 10)}...${hash.slice(-6)}`

export const isTokenHashRevoked = (hash: string) =>
  permanentlyRevokedTokenHashes.has(normalizeHash(hash)) || runtimeRevokedTokenHashes.has(normalizeHash(hash))

export const revokeTokenHash = (hash: string) => {
  const normalized = normalizeHash(hash)
  runtimeRevokedTokenHashes.add(normalized)
  return normalized
}

export const findAccessToken = (token: string) => {
  const tokenHash = hashAccessToken(token)
  return {
    tokenHash,
    record: accessTokens.find((record) => safeEqual(record.tokenHash, tokenHash))
  }
}
