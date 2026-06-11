import { readBody } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import { assertArtistExists, normalizeOptionalText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  createPublishingRegistrationBatch,
  normalizeRegistrationTrackInputs,
} from "~~/server/utils/publishing-registration"
import type {
  AdminPublishingDirectBatchInput,
  PublishingRegistrationMutationResponse,
} from "~~/types/publishing"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<AdminPublishingDirectBatchInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const adminNotes = normalizeOptionalText(body.adminNotes)
  const tracks = normalizeRegistrationTrackInputs(body.tracks)
  const supabase = serverSupabaseServiceRole(event)

  await assertArtistExists(supabase, artistId)

  const result = await createPublishingRegistrationBatch({
    supabase,
    artistId,
    profileId: profile.id,
    batchSource: "admin_direct",
    writerScope: "admin",
    relationSource: "admin_direct",
    initialTrackStatus: "accepted",
    artistNotes: null,
    adminNotes,
    tracks,
  })

  await logAdminActivity(supabase, profile.id, "publishing.registration.direct_added", "publishing_registration_batch", result.batchId, {
    artist_id: artistId,
    track_count: tracks.length,
    track_ids: result.trackIds,
  })

  return {
    batchId: result.batchId,
    trackIds: result.trackIds,
    updatedCount: result.trackIds.length,
  } satisfies PublishingRegistrationMutationResponse
})
