import { createError, readBody } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeOptionalText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { updateBatchReviewStatuses } from "~~/server/utils/publishing-registration"
import type {
  AdminPublishingReviewInput,
  PublishingRegistrationMutationResponse,
} from "~~/types/publishing"

function normalizeTrackIds(value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Select at least one publishing registration track.",
    })
  }

  return [...new Set(value.map((entry, index) => normalizeRequiredUuid(entry, `Track ${index + 1}`)))]
}

function normalizeReviewAction(value: unknown) {
  const normalized = String(value ?? "").trim()

  if (normalized === "accept") {
    return "accepted" as const
  }

  if (normalized === "reject") {
    return "rejected" as const
  }

  throw createError({
    statusCode: 400,
    statusMessage: "Review action must be accept or reject.",
  })
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<AdminPublishingReviewInput>(event)
  const trackIds = normalizeTrackIds(body.trackIds)
  const targetStatus = normalizeReviewAction(body.action)
  const adminNotes = normalizeOptionalText(body.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const { data: existingRows, error: existingError } = await supabase
    .from("publishing_registration_tracks")
    .select("id, batch_id, artist_id, status")
    .in("id", trackIds)

  if (existingError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load selected publishing registrations.",
    })
  }

  const pendingRows = ((existingRows ?? []) as Array<{ id: string; batch_id: string; artist_id: string; status: string }>)
    .filter((row) => row.status === "pending_review")

  if (!pendingRows.length) {
    throw createError({
      statusCode: 409,
      statusMessage: "Only pending publishing registration tracks can be reviewed.",
    })
  }

  const pendingIds = pendingRows.map((row) => row.id)
  const reviewedAt = new Date().toISOString()
  const { data: updatedRows, error: updateError } = await supabase
    .from("publishing_registration_tracks")
    .update({
      status: targetStatus,
      reviewed_by: profile.id,
      reviewed_at: reviewedAt,
      admin_notes: adminNotes,
    })
    .in("id", pendingIds)
    .select("id, batch_id, artist_id")

  if (updateError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to review publishing registrations.",
    })
  }

  const updated = (updatedRows ?? []) as Array<{ id: string; batch_id: string; artist_id: string }>

  await updateBatchReviewStatuses(
    supabase,
    updated.map((row) => row.batch_id),
    profile.id,
    adminNotes,
  )

  await logAdminActivity(supabase, profile.id, `publishing.registration.${targetStatus}`, "publishing_registration_track", null, {
    track_ids: updated.map((row) => row.id),
    artist_ids: [...new Set(updated.map((row) => row.artist_id))],
    admin_notes: adminNotes,
  })

  return {
    trackIds: updated.map((row) => row.id),
    updatedCount: updated.length,
  } satisfies PublishingRegistrationMutationResponse
})
