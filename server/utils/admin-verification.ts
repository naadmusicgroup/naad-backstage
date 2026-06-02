import { createClient } from "@supabase/supabase-js"
import { createError, deleteCookie, getCookie, setCookie, type H3Event } from "h3"
import { createHmac, timingSafeEqual } from "node:crypto"
import { useRuntimeConfig } from "#imports"

const COOKIE_NAME = "naad_admin_verification"
const COOKIE_MAX_AGE_SECONDS = 10 * 60

interface AdminVerificationPayload {
  v: 1
  userId: string
  action: string
  verifiedAt: number
  expiresAt: number
}

function encodePayload(payload: AdminVerificationPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
}

function decodePayload(value: string): AdminVerificationPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))

    if (
      parsed?.v === 1
      && typeof parsed.userId === "string"
      && typeof parsed.action === "string"
      && typeof parsed.verifiedAt === "number"
      && typeof parsed.expiresAt === "number"
    ) {
      return parsed
    }
  } catch {
    return null
  }

  return null
}

function signPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url")
}

function signaturesMatch(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  return left.length === right.length && timingSafeEqual(left, right)
}

function getAdminVerificationSecret(event: H3Event) {
  const config = useRuntimeConfig(event) as any
  const configuredSecret = String(
    config.adminVerificationSecret
    || process.env.NUXT_ADMIN_VERIFICATION_SECRET
    || process.env.ADMIN_VERIFICATION_SECRET
    || "",
  ).trim()

  if (configuredSecret) {
    return configuredSecret
  }

  if (process.env.NODE_ENV === "production") {
    throw createError({
      statusCode: 500,
      statusMessage: "Admin verification is not configured.",
    })
  }

  const devSeed = String(
    config.supabase?.secretKey
    || config.supabase?.serviceKey
    || config.public?.supabase?.key
    || "naad-backstage-dev-admin-verification",
  )

  return `dev:${devSeed}`
}

function signedCookieValue(payload: AdminVerificationPayload, secret: string) {
  const encodedPayload = encodePayload(payload)
  return `${encodedPayload}.${signPayload(encodedPayload, secret)}`
}

function clearAdminVerificationCookie(event: H3Event) {
  deleteCookie(event, COOKIE_NAME, {
    path: "/",
  })
}

export function deleteAdminVerification(event: H3Event) {
  clearAdminVerificationCookie(event)
}

export function setAdminVerification(event: H3Event, userId: string, action = "admin.high_risk") {
  const now = Date.now()
  const payload: AdminVerificationPayload = {
    v: 1,
    userId,
    action,
    verifiedAt: now,
    expiresAt: now + COOKIE_MAX_AGE_SECONDS * 1000,
  }

  setCookie(event, COOKIE_NAME, signedCookieValue(payload, getAdminVerificationSecret(event)), {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })

  return payload
}

export function readAdminVerification(event: H3Event, userId: string) {
  const cookieValue = getCookie(event, COOKIE_NAME)

  if (!cookieValue) {
    return null
  }

  const [encodedPayload, signature] = cookieValue.split(".")

  if (!encodedPayload || !signature) {
    clearAdminVerificationCookie(event)
    return null
  }

  const expectedSignature = signPayload(encodedPayload, getAdminVerificationSecret(event))

  if (!signaturesMatch(signature, expectedSignature)) {
    clearAdminVerificationCookie(event)
    return null
  }

  const payload = decodePayload(encodedPayload)

  if (!payload || payload.userId !== userId || payload.expiresAt <= Date.now()) {
    clearAdminVerificationCookie(event)
    return null
  }

  return payload
}

export function assertFreshAdminVerification(event: H3Event, userId: string, action: string) {
  const payload = readAdminVerification(event, userId)

  if (!payload) {
    throw createError({
      statusCode: 403,
      statusMessage: "Fresh admin verification is required for this action.",
      data: {
        code: "ADMIN_VERIFICATION_REQUIRED",
        action,
      },
    })
  }

  return payload
}

export async function verifyAdminPassword(event: H3Event, input: {
  email?: string | null
  password: string
  userId: string
}) {
  const config = useRuntimeConfig(event) as any
  const supabaseUrl = String(config.public?.supabase?.url ?? "").trim()
  const supabaseKey = String(config.public?.supabase?.key ?? "").trim()
  const email = String(input.email ?? "").trim()

  if (!email) {
    throw createError({
      statusCode: 400,
      statusMessage: "This admin account cannot be verified with a password.",
    })
  }

  if (!supabaseUrl || !supabaseKey) {
    throw createError({
      statusCode: 500,
      statusMessage: "Supabase auth is not configured.",
    })
  }

  const authClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  const { data, error } = await authClient.auth.signInWithPassword({
    email,
    password: input.password,
  })

  if (error || data.user?.id !== input.userId) {
    return false
  }

  return true
}
