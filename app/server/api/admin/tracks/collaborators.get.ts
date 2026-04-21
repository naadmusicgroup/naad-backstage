import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  assertArtistExists,
  assertTrackExists,
  mapTrackCollaboratorRecord,
  normalizeOptionalUuidQueryParam,
} from "~~/server/utils/catalog"
import type { AdminTrackCollaboratorRecord } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const artistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const trackId = normalizeOptionalUuidQueryParam(query.trackId, "Track id")
  const supabase = serverSupabaseServiceRole(event)

  let trackIds: string[] | null = null

  if (artistId) {
    await assertArtistExists(supabase, artistId)

    const { data: releaseRows, error: releaseError } = await supabase
      .from("releases")
      .select("id")
      .eq("artist_id", artistId)

    if (releaseError) {
      throw createError({
        statusCode: 500,
        statusMessage: releaseError.message,
      })
    }

    const releaseIds = (releaseRows ?? []).map((row: { id: string }) => row.id)

    if (!releaseIds.length) {
      return {
        collaborators: [],
      } satisfies { collaborators: AdminTrackCollaboratorRecord[] }
    }

    const { data: trackRows, error: trackError } = await supabase
      .from("tracks")
      .select("id")
      .in("release_id", releaseIds)

    if (trackError) {
      throw createError({
        statusCode: 500,
        statusMessage: trackError.message,
      })
    }

    trackIds = (trackRows ?? []).map((row: { id: string }) => row.id)
  }

  if (trackId) {
    const track = await assertTrackExists(supabase, trackId)
    trackIds = trackIds ? trackIds.filter((id) => id === track.id) : [track.id]
  }

  if (trackIds && !trackIds.length) {
    return {
      collaborators: [],
    } satisfies { collaborators: AdminTrackCollaboratorRecord[] }
  }

  let request = supabase
    .from("track_collaborators")
    .select("id, track_id, artist_id, role, split_pct, created_at, updated_at, artists!inner(id, name), tracks!inner(id, title, release_id)")
    .order("created_at", { ascending: true })

  if (trackIds) {
    request = request.in("track_id", trackIds)
  }

  const { data, error } = await request

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  return {
    collaborators: ((data ?? []) as any[]).map((row) => mapTrackCollaboratorRecord(row)) as AdminTrackCollaboratorRecord[],
  }
})
