import { createError, readBody } from "h3"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeOptionalText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import { sendAdminDashboardAlertEmail } from "~~/server/utils/email"
import { createAdminNotification } from "~~/server/utils/admin-notifications"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  createPublishingRegistrationBatch,
  normalizeRegistrationTrackInputs,
} from "~~/server/utils/publishing-registration"
import type {
  ArtistPublishingBatchInput,
  PublishingRegistrationMutationResponse,
} from "~~/types/publishing"

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const body = await readBody<ArtistPublishingBatchInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const artistNotes = normalizeOptionalText(body.artistNotes)
  const tracks = normalizeRegistrationTrackInputs(body.tracks)
  const supabase = serverSupabaseServiceRole(event)

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", artistId)
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .maybeSingle()

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to verify artist access.",
    })
  }

  if (!artist) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only submit publishing registrations for your active artist profiles.",
    })
  }

  const result = await createPublishingRegistrationBatch({
    supabase,
    artistId,
    profileId: profile.id,
    batchSource: "artist_request",
    writerScope: "artist",
    relationSource: "artist_submission",
    initialTrackStatus: "pending_review",
    artistNotes,
    adminNotes: null,
    tracks,
  })

  await sendAdminDashboardAlertEmail(event, {
    subject: "New publishing registration in Naad Backstage",
    title: "Publishing registration submitted",
    lines: [
      `${artist.name} submitted ${tracks.length} publishing track(s) for review.`,
      artistNotes ? `Artist note: ${artistNotes}` : "Review the request from the admin publishing workspace.",
    ],
    actionPath: "/admin/publishing",
    actionLabel: "Review publishing",
  })

  await createAdminNotification(event, {
    type: "publishing_submitted",
    title: "Publishing registration submitted",
    message: `${artist.name} submitted ${tracks.length} publishing track(s) for review.`,
    artistId,
    referenceId: result.batchId,
    actionPath: "/admin/publishing",
  })

  return {
    batchId: result.batchId,
    trackIds: result.trackIds,
    updatedCount: result.trackIds.length,
  } satisfies PublishingRegistrationMutationResponse
})
