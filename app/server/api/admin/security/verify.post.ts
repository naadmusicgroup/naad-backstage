import { createError, readBody } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import { setAdminVerification, verifyAdminPassword } from "~~/server/utils/admin-verification"
import {
  assertRateLimitCapacity,
  recordRateLimitAttempt,
  requestRateLimitKey,
  resetRateLimit,
} from "~~/server/utils/rate-limit"

interface VerifyAdminBody {
  password?: unknown
  action?: unknown
}

const WINDOW_MS = 10 * 60 * 1000
const FAILED_ATTEMPT_LIMIT = 5

export default defineEventHandler(async (event) => {
  const { user, userId } = await requireAdminProfile(event)
  const body = await readBody<VerifyAdminBody>(event)
  const password = typeof body?.password === "string" ? body.password : ""
  const action = typeof body?.action === "string" && body.action.trim()
    ? body.action.trim()
    : "admin.high_risk"
  const rateLimitKey = requestRateLimitKey(event, "admin-security-verify", userId)

  assertRateLimitCapacity({
    key: rateLimitKey,
    limit: FAILED_ATTEMPT_LIMIT,
    windowMs: WINDOW_MS,
    message: "Too many failed admin verification attempts. Try again later.",
  })

  if (!password) {
    recordRateLimitAttempt({
      key: rateLimitKey,
      limit: FAILED_ATTEMPT_LIMIT,
      windowMs: WINDOW_MS,
      message: "Too many failed admin verification attempts. Try again later.",
    })

    throw createError({
      statusCode: 400,
      statusMessage: "Enter your admin password to continue.",
    })
  }

  const verified = await verifyAdminPassword(event, {
    email: user.email,
    password,
    userId,
  })

  if (!verified) {
    recordRateLimitAttempt({
      key: rateLimitKey,
      limit: FAILED_ATTEMPT_LIMIT,
      windowMs: WINDOW_MS,
      message: "Too many failed admin verification attempts. Try again later.",
    })

    throw createError({
      statusCode: 401,
      statusMessage: "Admin password verification failed.",
    })
  }

  resetRateLimit(rateLimitKey)
  const verification = setAdminVerification(event, userId, action)

  return {
    ok: true,
    expiresAt: new Date(verification.expiresAt).toISOString(),
  }
})
