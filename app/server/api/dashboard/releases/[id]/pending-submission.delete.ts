import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const releaseId = normalizeRequiredUuid(event.context.params?.id, "Release id")
  const supabase = serverSupabaseServiceRole(event)

  const viewerArtistsResult = await supabase
    .from("artists")
    .select("id")
    .eq("user_id", profile.id)
    .eq("is_active", true)

  if (viewerArtistsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load your artist profiles.",
    })
  }

  const viewerArtistIds = ((viewerArtistsResult.data ?? []) as Array<{ id: string }>).map((artist) => artist.id)

  const releaseResult = await supabase
    .from("releases")
    .select("id, artist_id, status, title")
    .eq("id", releaseId)
    .maybeSingle()

  if (releaseResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: releaseResult.error.message,
    })
  }

  if (!releaseResult.data) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release does not exist.",
    })
  }

  const release = releaseResult.data as {
    id: string
    artist_id: string
    status: string
    title: string
  }

  if (!viewerArtistIds.includes(release.artist_id)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only the owning artist can delete this pending release.",
    })
  }

  if (release.status !== "draft") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only draft releases pending review can be deleted by the artist.",
    })
  }

  const submissionResult = await supabase
    .from("artist_release_submissions")
    .select("id, status")
    .eq("release_id", releaseId)
    .maybeSingle()

  if (submissionResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: submissionResult.error.message,
    })
  }

  if (!submissionResult.data || submissionResult.data.status !== "pending_review") {
    throw createError({
      statusCode: 409,
      statusMessage: "This release is not pending review.",
    })
  }

  const submission = submissionResult.data as { id: string; status: string }

  const { error: submissionTracksError } = await supabase
    .from("artist_release_submission_tracks")
    .delete()
    .eq("submission_id", submission.id)

  if (submissionTracksError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to withdraw submission tracks.",
    })
  }

  const { error: submissionDeleteError } = await supabase
    .from("artist_release_submissions")
    .delete()
    .eq("id", submission.id)
    .eq("status", "pending_review")

  if (submissionDeleteError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to withdraw this pending review submission.",
    })
  }

  const { error: tracksUpdateError } = await supabase
    .from("tracks")
    .update({
      status: "deleted",
      deleted_by: profile.id,
    })
    .eq("release_id", releaseId)
    .eq("status", "draft")

  if (tracksUpdateError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to delete the draft tracks.",
    })
  }

  const { data: deletedRelease, error: releaseUpdateError } = await supabase
    .from("releases")
    .update({
      status: "deleted",
      deleted_by: profile.id,
    })
    .eq("id", releaseId)
    .eq("status", "draft")
    .select("id, title")
    .maybeSingle()

  if (releaseUpdateError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to delete this pending release.",
    })
  }

  if (!deletedRelease) {
    throw createError({
      statusCode: 409,
      statusMessage: "This release can no longer be deleted from pending review.",
    })
  }

  await recordReleaseEvent(supabase, {
    releaseId,
    eventType: "release_deleted",
    actorRole: "artist",
    actorProfileId: profile.id,
    actorArtistId: release.artist_id,
    payload: {
      source: "artist_pending_review_delete",
      submissionId: submission.id,
      previousStatus: "pending_review",
    },
  })

  return {
    ok: true,
    releaseId,
    title: deletedRelease.title,
  }
})
