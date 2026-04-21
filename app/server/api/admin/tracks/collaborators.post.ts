import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  assertTrackExists,
  isSplitOverflowViolation,
  isUniqueViolation,
  mapTrackCollaboratorRecord,
  normalizeRequiredSplitPct,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import type { CreateTrackCollaboratorInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)

  const body = await readBody<CreateTrackCollaboratorInput>(event)
  const trackId = normalizeRequiredUuid(body.trackId, "Track")
  const artistId = normalizeRequiredUuid(body.artistId, "Collaborator artist")
  const role = normalizeRequiredText(body.role, "Collaborator role")
  const splitPct = normalizeRequiredSplitPct(body.splitPct, "Split percentage")
  const supabase = serverSupabaseServiceRole(event)

  const track = await assertTrackExists(supabase, trackId)
  const artist = await assertArtistExists(supabase, artistId)

  const { data, error } = await supabase
    .from("track_collaborators")
    .insert({
      track_id: trackId,
      artist_id: artistId,
      role,
      split_pct: splitPct,
    })
    .select("id, track_id, artist_id, role, split_pct, created_at, updated_at, artists!inner(id, name), tracks!inner(id, title, release_id)")
    .single()

  if (error) {
    throw createError({
      statusCode: isUniqueViolation(error) || isSplitOverflowViolation(error) ? 409 : 500,
      statusMessage: isUniqueViolation(error)
        ? "That collaborator role already exists on this track."
        : isSplitOverflowViolation(error)
          ? "Track collaborator splits cannot exceed 100%."
          : error.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "track.collaborator.created", "track_collaborator", data.id, {
    track_id: trackId,
    release_id: track.release_id,
    artist_id: artistId,
    artist_name: artist.name,
    role,
    split_pct: splitPct,
  })

  return {
    ok: true,
    collaborator: mapTrackCollaboratorRecord(data as any),
  }
})
