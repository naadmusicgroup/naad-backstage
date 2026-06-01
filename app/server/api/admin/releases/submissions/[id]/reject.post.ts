import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { dashboardEmailUrl, sendDashboardEmail } from "~~/server/utils/email"
import {
  normalizeOptionalText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"

interface RejectSubmissionInput {
  adminNotes?: string | null
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const submissionId = normalizeRequiredUuid(event.context.params?.id, "Submission id")
  const body = await readBody<RejectSubmissionInput>(event)
  const adminNotes = normalizeOptionalText(body.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const { data: submission, error: submissionError } = await supabase
    .from("artist_release_submissions")
    .select("id, release_id, artist_id, status, artists(name, email), releases(title)")
    .eq("id", submissionId)
    .single()

  if (submissionError || !submission) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release submission does not exist.",
    })
  }

  if (submission.status !== "pending_review") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only pending release submissions can be rejected.",
    })
  }

  const submissionArtist = firstRelation((submission as any).artists) as { name?: string | null; email?: string | null } | null
  const submissionRelease = firstRelation((submission as any).releases) as { title?: string | null } | null

  const { error: reviewError } = await supabase
    .from("artist_release_submissions")
    .update({
      status: "rejected",
      admin_notes: adminNotes,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId)

  if (reviewError) {
    throw createError({
      statusCode: 500,
      statusMessage: reviewError.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "release.submission.rejected", "artist_release_submission", submissionId, {
    release_id: submission.release_id,
    artist_id: submission.artist_id,
  })

  await recordReleaseEvent(supabase, {
    releaseId: submission.release_id,
    eventType: "request_rejected",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      submissionId,
      submissionStatus: "rejected",
      adminNotes,
    },
  })

  await sendDashboardEmail(event, {
    to: submissionArtist?.email,
    subject: "Your Naad Backstage release needs changes",
    preview: "A release submission was rejected.",
    title: "Release needs changes",
    lines: [
      submissionArtist?.name ? `Hi ${submissionArtist.name},` : "Hi,",
      `"${submissionRelease?.title || "Your release"}" was rejected in Naad Backstage.`,
      adminNotes ? `Admin note: ${adminNotes}` : "Open your dashboard to review the release status.",
    ],
    actionLabel: "View releases",
    actionUrl: dashboardEmailUrl(event, "/dashboard/releases"),
  })

  return {
    ok: true,
    releaseId: submission.release_id,
    submissionId,
  }
})
