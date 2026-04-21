import { createError } from "h3"
import type { AppRole } from "~~/types/auth"
import type { LoginInviteStatus } from "~~/types/settings"

const gmailPattern = /^[^@\s]+@gmail\.com$/i

export function normalizeStoredEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

export function isGmailAddress(value: string | null | undefined) {
  return gmailPattern.test(value?.trim() ?? "")
}

export function normalizeGmailInviteEmail(value: unknown, label = "Invite email") {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!isGmailAddress(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid @gmail.com address.`,
    })
  }

  return normalized
}

export function normalizeInviteRole(value: unknown): AppRole {
  if (value === "admin" || value === "artist") {
    return value
  }

  throw createError({
    statusCode: 400,
    statusMessage: "Invite role must be admin or artist.",
  })
}

export function normalizeEditableInviteStatus(value: unknown): Exclude<LoginInviteStatus, "accepted"> {
  if (value === "pending" || value === "revoked") {
    return value
  }

  throw createError({
    statusCode: 400,
    statusMessage: "Invite status must be pending or revoked.",
  })
}

export async function findAuthUserByEmail(supabase: any, email: string) {
  const normalizedEmail = email.toLowerCase()
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message || "Unable to inspect existing auth users.",
      })
    }

    const match = data.users.find((user: any) => normalizeStoredEmail(user.email) === normalizedEmail)

    if (match) {
      return match
    }

    if (data.users.length < 200) {
      return null
    }

    page += 1
  }
}

export function isCurrentGoogleAuthSession(user: any) {
  return user?.app_metadata?.provider === "google"
}
