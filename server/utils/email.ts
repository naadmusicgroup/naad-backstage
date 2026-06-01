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
  eyebrow?: string | null
  detailRows?: DashboardEmailDetailRow[]
  footerText?: string | null
  variant?: "default" | "access-pass"
}

interface DashboardEmailResult {
  ok: boolean
  skipped?: string
  id?: string
  errorMessage?: string
}

interface DashboardEmailDetailRow {
  label: string
  value: string | null | undefined
}

interface DashboardEmailAssets {
  logoUrl: string
  accessPassHeaderUrl: string
  accessPassLogoUrl: string
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

function resolveEmailAssetUrl(event: H3Event, path: string) {
  return absoluteDashboardUrl(event, path)
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

  const detailLines = (input.detailRows ?? [])
    .filter((row) => row.value)
    .map((row) => `${row.label}: ${row.value}`)

  if (detailLines.length) {
    content.push("", ...detailLines)
  }

  if (input.actionUrl) {
    content.push("", `${input.actionLabel || "Open dashboard"}: ${input.actionUrl}`)
  }

  content.push("", "Naad Backstage")

  return content.join("\n")
}

function renderAccessPassDetailRows(rows: DashboardEmailDetailRow[] | undefined) {
  const visibleRows = (rows ?? []).filter((row) => row.value)

  if (!visibleRows.length) {
    return ""
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:26px 0 0;background:#11100c!important;border:1px solid #2c2518;border-radius:15px;overflow:hidden;table-layout:fixed;">
${visibleRows.map((row, index) => {
  const value = String(row.value)
  const valueColor = index === 0 ? "#fff7e3" : "#fff1c8"
  const valueMarkup = value.includes("@")
    ? `<a href="mailto:${escapeHtml(value)}" style="color:${valueColor}!important;text-decoration:none!important;white-space:nowrap;">${escapeHtml(value)}</a>`
    : `<span style="color:${valueColor}!important;text-decoration:none!important;white-space:nowrap;">${escapeHtml(value)}</span>`

  return `                  <tr>
                    <td style="padding:19px 22px;${index === 0 ? "background:#11100c!important;" : "border-top:1px solid #2c2518;background:#17150f!important;"}">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;">
                        <tr>
                          <td width="118" style="width:118px;color:${index === 0 ? "#b89532" : "#8f856f"}!important;font-size:11px;font-weight:850;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;">${escapeHtml(row.label)}</td>
                          <td align="right" class="nb-unlink" style="color:${valueColor}!important;font-size:${index === 0 ? "15px" : "14px"};line-height:1.35;font-weight:${index === 0 ? "750" : "800"};white-space:nowrap;word-break:normal;overflow-wrap:normal;text-decoration:none!important;">${valueMarkup}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>`
}).join("\n")}
                </table>`
}

function renderAccessPassHtml(input: DashboardEmailInput, assets: DashboardEmailAssets) {
  const preview = input.preview ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(input.preview)}</span>` : ""
  const lines = input.lines
    .filter(Boolean)
    .map((line, index) => `<p style="margin:${index === 0 ? "0" : "12px 0 0"};color:#352f25;font-size:16px;line-height:1.55;">${escapeHtml(String(line))}</p>`)
    .join("")
  const details = renderAccessPassDetailRows(input.detailRows)
  const action = input.actionUrl
    ? `<p style="margin:28px 0 0;">
                  <a href="${escapeHtml(input.actionUrl)}" style="display:block;background:#a98226;color:#fff8e6;border:1px solid #8a650f;border-radius:11px;font-size:15px;font-weight:600;text-align:center;text-decoration:none;padding:15px 18px;text-shadow:0 1px 0 #5f4306;box-shadow:inset 0 1px 0 #fff0a8,inset 0 -10px 18px rgba(66,42,0,.28),0 3px 0 #6d4d08;">${escapeHtml(input.actionLabel || "Open dashboard")}</a>
                </p>`
    : ""
  const footerText = input.footerText || "Naad Backstage | invite-only access"

  return `<!doctype html>
<html style="background:#f1ece2;color-scheme:light;">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(input.subject)}</title>
    <style>
      :root { color-scheme: light; supported-color-schemes: light; }
      body, table, td, p, a, span, h1 { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; text-size-adjust: 100%; }
      a[x-apple-data-detectors], .nb-unlink a { color: inherit !important; text-decoration: none !important; }
      @media (prefers-color-scheme: dark) {
        .nb-page { background: #f1ece2 !important; }
        .nb-card { background: #fffaf0 !important; border-color: #d9ccb4 !important; }
        .nb-body { background: #fffaf0 !important; color: #11100c !important; }
        .nb-footer { background: #fbf4e7 !important; color: #8a806e !important; }
      }
    </style>
  </head>
  <body class="nb-page" style="margin:0!important;padding:0!important;background:#f1ece2!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#11100c!important;color-scheme:light;">
    ${preview}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="nb-page" style="width:100%;background:#f1ece2!important;padding:44px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="584" cellpadding="0" cellspacing="0" class="nb-card" style="width:584px;max-width:584px;background:#fffaf0!important;border:1px solid #d9ccb4;border-radius:18px;overflow:hidden;">
            <tr>
              <td background="${escapeHtml(assets.accessPassHeaderUrl)}" style="background-color:#060503;background-image:url('${escapeHtml(assets.accessPassHeaderUrl)}');background-repeat:no-repeat;background-position:center center;background-size:cover;padding:30px 34px 30px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      <img src="${escapeHtml(assets.accessPassLogoUrl)}" width="148" alt="Naad Backstage" style="display:block;width:148px;max-width:72%;height:auto;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td align="right" style="vertical-align:middle;padding-top:22px;">
                      <span style="display:inline-block;color:#f3d26b;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">Private</span>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:54px;">
                  <tr>
                    <td>
                      <p style="margin:0;color:#d4ae44;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;">${escapeHtml(input.eyebrow || "Access pass")}</p>
                      <h1 style="margin:9px 0 0;color:#fff8e6;font-size:30px;line-height:1.1;font-weight:850;letter-spacing:0;">${escapeHtml(input.title)}</h1>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="nb-body" style="padding:34px 34px 32px;background:#fffaf0!important;color:#11100c!important;">
                ${lines}
                ${details}
                ${action}
                <p style="margin:18px 0 0;color:#796e5d;font-size:12px;line-height:1.55;text-align:center;">Not expecting this? You can ignore it.</p>
              </td>
            </tr>
            <tr>
              <td class="nb-footer" style="padding:18px 34px;border-top:1px solid #e4d8c2;background:#fbf4e7!important;">
                <p style="margin:0;color:#8a806e;font-size:12px;line-height:1.5;text-align:center;">${escapeHtml(footerText)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function renderHtml(input: DashboardEmailInput, assets: DashboardEmailAssets) {
  if (input.variant === "access-pass") {
    return renderAccessPassHtml(input, assets)
  }

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
                <img src="${escapeHtml(assets.logoUrl)}" width="152" alt="Naad Backstage" style="display:block;width:152px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;">
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
    const assets: DashboardEmailAssets = {
      logoUrl: resolveEmailLogoUrl(event),
      accessPassHeaderUrl: resolveEmailAssetUrl(event, "/email-access-pass-header.jpg"),
      accessPassLogoUrl: resolveEmailAssetUrl(event, "/email-logo.png"),
    }
    const { data, error } = await resend.emails.send({
      from: resolveFromAddress(),
      to,
      subject: input.subject,
      html: renderHtml(input, assets),
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

  return await sendDashboardEmail(event, {
    to: invite.email,
    subject: "Naad Backstage access",
    preview: `Private dashboard access for ${invite.email}.`,
    title: "Your access is ready",
    lines: [
      "Continue with Google using this Gmail.",
    ],
    detailRows: [
      { label: "Gmail", value: invite.email },
      { label: "Access", value: `${roleLabel[0].toUpperCase()}${roleLabel.slice(1)} dashboard` },
    ],
    actionLabel: "Open dashboard",
    actionUrl: loginUrl,
    eyebrow: "Access pass",
    footerText: "Naad Backstage | invite-only access",
    variant: "access-pass",
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
