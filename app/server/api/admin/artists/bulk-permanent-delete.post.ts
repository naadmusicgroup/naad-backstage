import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  aggregateArtistStorageCleanup,
  permanentlyDeleteArtistForAdmin,
} from "~~/server/utils/admin-artist-purge"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type {
  AdminArtistPermanentDeleteResult,
  AdminBulkArtistDeleteFailure,
  AdminBulkArtistDeleteResponse,
} from "~~/types/settings"

interface BulkPermanentDeleteBody {
  artistIds?: unknown[]
}

interface ArtistLookupRow {
  id: string
  name: string
}

function normalizeArtistIds(value: unknown[]) {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const entry of value) {
    const artistId = normalizeRequiredUuid(entry, "Artist id")

    if (!seen.has(artistId)) {
      seen.add(artistId)
      normalized.push(artistId)
    }
  }

  return normalized
}

function errorStatusMessage(error: any) {
  return error?.statusMessage || error?.data?.statusMessage || error?.message || "Unable to permanently delete this artist."
}

function emptyStorageCleanup() {
  return {
    csvImports: 0,
    releaseAssets: 0,
    artistAvatars: 0,
    totalObjectsRemoved: 0,
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "artist.bulk_permanently_deleted")
  const body = await readBody<BulkPermanentDeleteBody>(event) ?? {}
  const artistIds = normalizeArtistIds(Array.isArray(body.artistIds) ? body.artistIds : [])
  const supabase = serverSupabaseServiceRole(event)

  if (!artistIds.length) {
    return {
      ok: false,
      action: "bulkPermanentDelete",
      requestedArtistIds: [],
      deletedArtistIds: [],
      removedAuthUserIds: [],
      results: [],
      storageCleanup: emptyStorageCleanup(),
      failure: {
        artistId: "",
        artistName: null,
        statusMessage: "Select at least one artist to delete.",
        deletedBeforeFailure: 0,
      },
    } satisfies AdminBulkArtistDeleteResponse
  }

  const { data: artistRows, error: artistRowsError } = await supabase
    .from("artists")
    .select("id, name")
    .in("id", artistIds)

  if (artistRowsError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistRowsError.message,
    })
  }

  const artistLookup = new Map((artistRows ?? []).map((artist: ArtistLookupRow) => [artist.id, artist]))
  const results: AdminArtistPermanentDeleteResult[] = []
  let failure: AdminBulkArtistDeleteFailure | undefined

  for (const artistId of artistIds) {
    const artist = artistLookup.get(artistId)

    if (!artist) {
      failure = {
        artistId,
        artistName: null,
        statusMessage: "The selected artist does not exist.",
        deletedBeforeFailure: results.length,
      }
      break
    }

    try {
      const result = await permanentlyDeleteArtistForAdmin(supabase, profile.id, artistId, {
        logAction: null,
      })

      results.push(result)
    } catch (error: any) {
      failure = {
        artistId,
        artistName: artist.name,
        statusMessage: errorStatusMessage(error),
        deletedBeforeFailure: results.length,
      }
      break
    }
  }

  const deletedArtistIds = results.map((result) => result.artistId)
  const removedAuthUserIds = results
    .map((result) => result.removedAuthUserId)
    .filter((value): value is string => Boolean(value))
  const storageCleanup = aggregateArtistStorageCleanup(results)

  if (results.length) {
    await logAdminActivity(supabase, profile.id, "artist.bulk_permanently_deleted", "artist", null, {
      requested_artist_ids: artistIds,
      deleted_artist_ids: deletedArtistIds,
      deleted_artist_names: results.map((result) => result.artistName),
      deleted_count: results.length,
      removed_login_user_ids: removedAuthUserIds,
      storage_cleanup: storageCleanup,
      failure: failure ?? null,
    })
  }

  return {
    ok: !failure,
    action: "bulkPermanentDelete",
    requestedArtistIds: artistIds,
    deletedArtistIds,
    removedAuthUserIds,
    results,
    storageCleanup,
    ...(failure ? { failure } : {}),
  } satisfies AdminBulkArtistDeleteResponse
})
