import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import { loadTrackCreditsByTrackIds } from "~~/server/utils/release-lifecycle"
import type {
  NaadLinkSocial,
  ReleaseOptionForLinks,
  ReleaseOptionsResponse,
  ReleaseTrackForLinks,
} from "~~/types/naadlinks"

function artistNameOf(value: unknown): string {
  const obj = Array.isArray(value) ? value[0] : value
  return (obj as { name?: string } | null)?.name ?? ""
}

export default defineEventHandler(async (event): Promise<ReleaseOptionsResponse> => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const artistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  if (!artistId) {
    return { releases: [], social: {} }
  }

  const supabase = serverSupabaseServiceRole(event)

  const { data: releaseRows, error: releaseError } = await supabase
    .from("releases")
    .select("id, title, cover_art_url, release_date, created_at, artists(name)")
    .eq("artist_id", artistId)
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (releaseError) {
    throw createError({ statusCode: 500, statusMessage: releaseError.message })
  }

  const releases = releaseRows ?? []
  const releaseIds = releases.map((row) => row.id)

  let trackRows: Array<{ id: string; release_id: string; title: string; audio_preview_url: string | null }> = []
  if (releaseIds.length) {
    const { data, error } = await supabase
      .from("tracks")
      .select("id, release_id, title, audio_preview_url, track_number, created_at")
      .in("release_id", releaseIds)
      .order("track_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
    trackRows = (data ?? []) as typeof trackRows
  }

  const creditsByTrack = await loadTrackCreditsByTrackIds(supabase, trackRows.map((row) => row.id))

  const tracksByRelease = new Map<string, ReleaseTrackForLinks[]>()
  for (const row of trackRows) {
    const credits = (creditsByTrack.get(row.id) ?? []).map((credit) => ({
      name: credit.creditedName,
      role: credit.roleCode,
    }))
    const list = tracksByRelease.get(row.release_id) ?? []
    list.push({ id: row.id, title: row.title, audioPreviewUrl: row.audio_preview_url ?? null, credits })
    tracksByRelease.set(row.release_id, list)
  }

  const releaseOptions: ReleaseOptionForLinks[] = releases.map((row) => ({
    id: row.id,
    title: row.title,
    artistName: artistNameOf(row.artists),
    coverArtUrl: row.cover_art_url ?? null,
    releaseDate: row.release_date ?? null,
    tracks: tracksByRelease.get(row.id) ?? [],
  }))

  const { data: socialRows } = await supabase
    .from("artist_social_links")
    .select("platform, url")
    .eq("artist_id", artistId)

  const social: NaadLinkSocial = {}
  for (const row of socialRows ?? []) {
    const platform = row.platform as keyof NaadLinkSocial
    if (platform === "instagram" || platform === "youtube" || platform === "tiktok" || platform === "facebook") {
      social[platform] = row.url
    }
  }

  return { releases: releaseOptions, social }
})
