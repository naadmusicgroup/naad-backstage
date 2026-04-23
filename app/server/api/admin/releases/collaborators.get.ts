import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  assertArtistExists,
  assertReleaseExists,
  mapReleaseCollaboratorRecord,
  normalizeOptionalUuidQueryParam,
} from "~~/server/utils/catalog"
import type { AdminReleaseCollaboratorRecord } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const artistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const releaseId = normalizeOptionalUuidQueryParam(query.releaseId, "Release id")
  const supabase = serverSupabaseServiceRole(event)

  let releaseIds: string[] | null = null

  if (artistId) {
    await assertArtistExists(supabase, artistId)

    const { data, error } = await supabase
      .from("releases")
      .select("id")
      .eq("artist_id", artistId)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    releaseIds = (data ?? []).map((row: { id: string }) => row.id)
  }

  if (releaseId) {
    const release = await assertReleaseExists(supabase, releaseId)
    releaseIds = releaseIds ? releaseIds.filter((id) => id === release.id) : [release.id]
  }

  if (releaseIds && !releaseIds.length) {
    return {
      collaborators: [],
    } satisfies { collaborators: AdminReleaseCollaboratorRecord[] }
  }

  let request = supabase
    .from("release_collaborators")
    .select("id, release_id, artist_id, role, split_pct, created_at, updated_at, artists!inner(id, name)")
    .order("created_at", { ascending: true })

  if (releaseIds) {
    request = request.in("release_id", releaseIds)
  }

  const { data, error } = await request

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  return {
    collaborators: ((data ?? []) as any[]).map((row) => mapReleaseCollaboratorRecord(row)) as AdminReleaseCollaboratorRecord[],
  }
})

