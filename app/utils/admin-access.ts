import type {
  AdminLoginInviteRecord,
  LoginInviteRole,
} from "~~/types/settings"

export type ArtistAccessMethod = "password" | "gmailInvite"

export interface AccessDraft {
  email: string
  role: LoginInviteRole
  fullName: string
  artistName: string
  country: string
  bio: string
}

export interface ArtistCreateDraft extends AccessDraft {
  accessMethod: ArtistAccessMethod
  password: string
}

export function normalizedText(value: string | null | undefined) {
  return String(value ?? "").trim()
}

export function normalizedOptionalText(value: string | null | undefined) {
  return normalizedText(value) || ""
}

export function normalizedEmail(value: string | null | undefined) {
  return normalizedText(value).toLowerCase()
}

export function nullableText(value: string) {
  const normalized = value.trim()
  return normalized || null
}

export function emptyAccessDraft(role: LoginInviteRole = "artist"): AccessDraft {
  return {
    email: "",
    role,
    fullName: "",
    artistName: "",
    country: "",
    bio: "",
  }
}

export function emptyArtistCreateDraft(): ArtistCreateDraft {
  return {
    ...emptyAccessDraft("artist"),
    accessMethod: "password",
    password: "",
  }
}

export function buildAccessDraft(invite: AdminLoginInviteRecord): AccessDraft {
  return {
    email: invite.email,
    role: invite.role,
    fullName: invite.fullName,
    artistName: invite.artistName ?? "",
    country: invite.country ?? "",
    bio: invite.bio ?? "",
  }
}

export function accessDraftChanged(invite: AdminLoginInviteRecord, draft: AccessDraft | undefined) {
  if (!draft) {
    return false
  }

  return (
    normalizedEmail(draft.email) !== normalizedEmail(invite.email)
    || draft.role !== invite.role
    || normalizedText(draft.fullName) !== normalizedText(invite.fullName)
    || normalizedOptionalText(draft.artistName) !== normalizedOptionalText(invite.artistName)
    || normalizedOptionalText(draft.country) !== normalizedOptionalText(invite.country)
    || normalizedOptionalText(draft.bio) !== normalizedOptionalText(invite.bio)
  )
}
