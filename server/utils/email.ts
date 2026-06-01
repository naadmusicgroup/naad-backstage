import type { SupabaseClient } from "@supabase/supabase-js"
import { useRuntimeConfig } from "#imports"
import type { H3Event } from "h3"
import { Resend } from "resend"
import type { ArtistNotificationType } from "~~/types/dashboard"
import type { LoginInviteRole } from "~~/types/settings"

interface DashboardEmailInput {
  to: string | string[] | null | undefined
  subject: string
  preview?: string | null
  title: string
  lines: Array<string | null | undefined>
  actionLabel?: string | null
  actionUrl?: string | null
  replyTo?: string | string[] | null
}

interface DashboardEmailResult {
  ok: boolean
  skipped?: string
  id?: string
  errorMessage?: string
}

interface NotificationEmailRow {
  id: string
  title: string
  message: string | null
  type: ArtistNotificationType
  reference_id: string | null
  artists: NotificationEmailArtist | NotificationEmailArtist[] | null
}

interface NotificationEmailArtist {
  id: string
  name: string
  email: string | null
}

interface LoginInviteEmailInput {
  email: string
  role: LoginInviteRole
  fullName: string
  artistName?: string | null
  invitedByName?: string | null
}

interface ArtistAccessEmailInput {
  email: string | null | undefined
  fullName?: string | null
  title: string
  subject: string
  lines: string[]
}

interface AdminDashboardAlertInput {
  subject: string
  title: string
  lines: string[]
  actionPath?: string | null
  actionLabel?: string | null
}

const DEFAULT_FROM = "Naad Backstage <noreply@auth.naadbackstage.com>"
const NOTIFICATION_ACTION_PATHS: Record<ArtistNotificationType, string> = {
  due_added: "/dashboard/wallet?section=dues",
  earnings_posted: "/dashboard/statements",
  payout_approved: "/dashboard/wallet?section=history",
  payout_paid: "/dashboard/wallet?section=history",
  payout_rejected: "/dashboard/wallet?section=history",
}

let cachedApiKey = ""
let cachedResend: Resend | null = null

function normalizeEmailAddress(value: string | null | undefined) {
  return String(value ?? "").trim()
}

function normalizeEmailAddresses(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",")

  return values
    .map((item) => item.trim())
    .filter((item) => item.includes("@"))
}

function resolveEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim()

    if (value) {
      return value
    }
  }

  return ""
}

function resolveResendClient() {
  const apiKey = resolveEnvValue("RESEND_API_KEY", "NUXT_RESEND_API_KEY")

  if (!apiKey) {
    return null
  }

  if (cachedResend && cachedApiKey === apiKey) {
    return cachedResend
  }

  cachedApiKey = apiKey
  cachedResend = new Resend(apiKey)

  return cachedResend
}

function resolveFromAddress() {
  return resolveEnvValue("RESEND_FROM", "EMAIL_FROM", "NUXT_EMAIL_FROM") || DEFAULT_FROM
}

function resolveReplyTo(value?: string | string[] | null) {
  const explicit = normalizeEmailAddresses(value)

  if (explicit.length) {
    return explicit
  }

  return normalizeEmailAddresses(resolveEnvValue("RESEND_REPLY_TO", "EMAIL_REPLY_TO", "NUXT_EMAIL_REPLY_TO"))
}

function resolveAdminAlertRecipients() {
  return normalizeEmailAddresses(resolveEnvValue(
    "DASHBOARD_ADMIN_ALERT_EMAILS",
    "ADMIN_ALERT_EMAILS",
    "NUXT_DASHBOARD_ADMIN_ALERT_EMAILS",
  ))
}

function emailsDisabled() {
  return ["1", "true", "yes"].includes(
    resolveEnvValue("DASHBOARD_EMAILS_DISABLED", "EMAILS_DISABLED", "NUXT_DASHBOARD_EMAILS_DISABLED").toLowerCase(),
  )
}

function publicSiteUrl(event: H3Event) {
  const config = useRuntimeConfig(event)
  return String(config.public?.siteUrl || process.env.NUXT_PUBLIC_SITE_URL || "http://localhost:3000").trim()
}

function publicSupabaseUrl(event: H3Event) {
  const config = useRuntimeConfig(event)
  return String(config.public?.supabase?.url || process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim()
}

function absoluteDashboardUrl(event: H3Event, path = "/dashboard") {
  const baseUrl = publicSiteUrl(event).replace(/\/+$/, "")
  const cleanPath = path.startsWith("/") ? path : `/${path}`

  try {
    return new URL(cleanPath, `${baseUrl}/`).toString()
  } catch {
    return `${baseUrl}${cleanPath}`
  }
}

export function dashboardEmailUrl(event: H3Event, path = "/dashboard") {
  return absoluteDashboardUrl(event, path)
}

function resolveEmailLogoUrl(event: H3Event) {
  const configuredLogoUrl = resolveEnvValue("EMAIL_LOGO_URL", "NUXT_EMAIL_LOGO_URL")

  if (configuredLogoUrl) {
    return configuredLogoUrl
  }

  const supabaseUrl = publicSupabaseUrl(event).replace(/\/+$/, "")

  if (supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/email-assets/brand/naad-backstage-logo-512.png`
  }

  return absoluteDashboardUrl(event, "/logo-512.png")
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderText(input: DashboardEmailInput) {
  const content = [
    input.title,
    "",
    ...input.lines.filter(Boolean).map((line) => String(line)),
  ]

  if (input.actionUrl) {
    content.push("", `${input.actionLabel || "Open dashboard"}: ${input.actionUrl}`)
  }

  content.push("", "Naad Backstage")

  return content.join("\n")
}

function renderHtml(input: DashboardEmailInput, logoUrl: string) {
  const lines = input.lines
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 14px;color:#312b1f;font-size:15px;line-height:1.55;">${escapeHtml(String(line))}</p>`)
    .join("")
  const action = input.actionUrl
    ? `<p style="margin:26px 0 4px;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;border-radius:10px;background:#16130d;color:#fff8e6;font-size:14px;font-weight:800;text-decoration:none;padding:13px 18px;">${escapeHtml(input.actionLabel || "Open dashboard")}</a></p>`
    : ""
  const preview = input.preview ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(input.preview)}</span>` : ""

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(input.subject)}</title>
  </head>
  <body style="margin:0;background:#fef9e7;font-family:Arial,Helvetica,sans-serif;">
    ${preview}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef9e7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:584px;background:#fffdf4;border:1px solid #e5d8b9;border-radius:12px;box-shadow:0 18px 44px rgba(91,72,29,.10);overflow:hidden;">
            <tr>
              <td style="background:#f7efd4;border-bottom:1px solid #eadfbe;padding:22px 28px 18px;">
                <img src="${escapeHtml(logoUrl)}" width="152" alt="Naad Backstage" style="display:block;width:152px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;">
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 12px;">
                <div style="color:#8c6b24;font-size:12px;font-weight:800;letter-spacing:0;text-transform:uppercase;">Dashboard update</div>
                <h1 style="margin:10px 0 18px;color:#16130d;font-size:24px;line-height:1.2;font-weight:800;">${escapeHtml(input.title)}</h1>
                ${lines}
                ${action}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 26px;color:#746a57;font-size:12px;line-height:1.5;">
                Sent by Naad Backstage. This is a transactional dashboard email from Naad Music Group.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export async function sendDashboardEmail(event: H3Event, input: DashboardEmailInput): Promise<DashboardEmailResult> {
  const to = normalizeEmailAddresses(input.to)

  if (!to.length) {
    return { ok: false, skipped: "missing_recipient" }
  }

  if (emailsDisabled()) {
    return { ok: false, skipped: "disabled" }
  }

  const resend = resolveResendClient()

  if (!resend) {
    console.warn(`[email] Skipped "${input.subject}" because RESEND_API_KEY is not configured.`)
    return { ok: false, skipped: "missing_resend_api_key" }
  }

  try {
    const replyTo = resolveReplyTo(input.replyTo)
    const logoUrl = resolveEmailLogoUrl(event)
    const { data, error } = await resend.emails.send({
      from: resolveFromAddress(),
      to,
      subject: input.subject,
      html: renderHtml(input, logoUrl),
      text: renderText(input),
      ...(replyTo.length ? { replyTo } : {}),
    })

    if (error) {
      const message = typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Unable to send email."

      console.error(`[email] Failed to send "${input.subject}": ${message}`)
      return { ok: false, errorMessage: message }
    }

    return { ok: true, id: data?.id }
  } catch (error: any) {
    const message = error?.message || "Unable to send email."
    console.error(`[email] Failed to send "${input.subject}": ${message}`)
    return { ok: false, errorMessage: message }
  }
}

export async function sendLoginInviteEmail(event: H3Event, invite: LoginInviteEmailInput) {
  const roleLabel = invite.role === "admin" ? "admin" : "artist"
  const loginUrl = absoluteDashboardUrl(event, "/login")
  const artistLine = invite.artistName ? `Artist profile: ${invite.artistName}.` : null
  const invitedByLine = invite.invitedByName ? `${invite.invitedByName} invited you to Naad Backstage.` : "You have been invited to Naad Backstage."

  return await sendDashboardEmail(event, {
    to: invite.email,
    subject: "Your Naad Backstage invite",
    preview: "Use your invited Gmail account to sign in.",
    title: "Your dashboard invite is ready",
    lines: [
      `Hi ${invite.fullName},`,
      invitedByLine,
      `Use ${invite.email} with Google sign-in to open your ${roleLabel} dashboard.`,
      artistLine,
    ],
    actionLabel: "Open Naad Backstage",
    actionUrl: loginUrl,
  })
}

export async function sendArtistAccessEmail(event: H3Event, input: ArtistAccessEmailInput) {
  const loginUrl = absoluteDashboardUrl(event, "/login")

  return await sendDashboardEmail(event, {
    to: input.email,
    subject: input.subject,
    preview: input.lines[0] ?? input.title,
    title: input.title,
    lines: [
      input.fullName ? `Hi ${input.fullName},` : "Hi,",
      ...input.lines,
    ],
    actionLabel: "Open Naad Backstage",
    actionUrl: loginUrl,
  })
}

export async function sendArtistNotificationEmail(
  event: H3Event,
  supabase: SupabaseClient<any>,
  input: { type: ArtistNotificationType; referenceId: string },
) {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, message, type, reference_id, artists!inner(id, name, email)")
    .eq("type", input.type)
    .eq("reference_id", input.referenceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<NotificationEmailRow>()

  if (error) {
    console.error(`[email] Unable to load notification email payload: ${error.message}`)
    return { ok: false, errorMessage: error.message }
  }

  if (!data) {
    return { ok: false, skipped: "notification_not_found" }
  }

  const artist = unwrapJoinRow(data.artists)
  const artistEmail = normalizeEmailAddress(artist?.email)

  if (!artistEmail) {
    return { ok: false, skipped: "missing_artist_email" }
  }

  return await sendDashboardEmail(event, {
    to: artistEmail,
    subject: `Naad Backstage: ${data.title}`,
    preview: data.message || data.title,
    title: data.title,
    lines: [
      artist?.name ? `Hi ${artist.name},` : "Hi,",
      data.message || "There is a new update in your Naad Backstage dashboard.",
    ],
    actionLabel: "View in dashboard",
    actionUrl: absoluteDashboardUrl(event, NOTIFICATION_ACTION_PATHS[data.type] ?? "/dashboard/notifications"),
  })
}

export async function sendAdminDashboardAlertEmail(event: H3Event, input: AdminDashboardAlertInput) {
  const recipients = resolveAdminAlertRecipients()

  if (!recipients.length) {
    return { ok: false, skipped: "missing_admin_recipients" }
  }

  return await sendDashboardEmail(event, {
    to: recipients,
    subject: input.subject,
    preview: input.lines[0] ?? input.title,
    title: input.title,
    lines: input.lines,
    actionLabel: input.actionLabel || "Open admin dashboard",
    actionUrl: absoluteDashboardUrl(event, input.actionPath || "/admin"),
  })
}
