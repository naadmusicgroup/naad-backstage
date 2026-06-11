import { Buffer } from "node:buffer"
import type { SupabaseClient } from "@supabase/supabase-js"
import { parse as parseCsv } from "csv-parse/sync"
import { createError } from "h3"
import { MAX_CSV_UPLOAD_BYTES } from "~~/server/utils/imports"
import { fetchAllByChunks, fetchAllPages } from "~~/server/utils/supabase-pagination"
import type {
  BulkCatalogImportResponse,
  CatalogImportIssue,
  CatalogImportIssueCode,
  ReleaseType,
} from "~~/types/catalog"

interface RawCatalogCsvRow {
  [key: string]: unknown
}

interface PreparedCatalogTrackRow {
  releaseTitle: string
  releaseDate: string
  upc: string | null
  baseTrackTitle: string
  trackTitle: string
  versionLine: string | null
  isrc: string
  trackNumber: number | null
  audioPreviewUrl: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseFormat: string | null
  primaryArtistNames: string[]
}

interface PreparedCatalogReleaseGroup {
  key: string
  title: string
  releaseDate: string
  upc: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseFormat: string | null
  tracks: PreparedCatalogTrackRow[]
}

interface ExistingReleaseRow {
  id: string
  artist_id: string
  title: string
  upc: string | null
  release_date: string | null
}

interface ExistingTrackReleaseJoinRow {
  artist_id: string
  title: string
}

interface ExistingTrackRow {
  id: string
  artist_id: string
  isrc: string
  title: string
  version_line: string | null
  release_id: string
  releases: ExistingTrackReleaseJoinRow | ExistingTrackReleaseJoinRow[] | null
}

interface ArtistCreditRow {
  id: string
  name: string
}

function trimCell(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value).trim()
}

function normalizeLookupKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function normalizeTrackVersion(value: unknown) {
  const trimmed = trimCell(value)

  if (!trimmed || trimmed.toLowerCase() === "original") {
    return null
  }

  return trimmed
}

function trackTitleWithVersion(trackTitle: string, versionLine: string | null) {
  return versionLine ? `${trackTitle} - ${versionLine}` : trackTitle
}

function parsePrimaryArtistNames(value: unknown) {
  const seen = new Set<string>()
  const names: string[] = []

  for (const entry of trimCell(value).split(",")) {
    const name = entry.trim().replace(/\s+/g, " ")

    if (!name) {
      continue
    }

    const key = normalizeLookupKey(name)

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    names.push(name)
  }

  return names
}

function hasCsvContent(row: RawCatalogCsvRow) {
  return Object.values(row).some((value) => trimCell(value).length > 0)
}

function pushIssue(
  issues: CatalogImportIssue[],
  code: CatalogImportIssueCode,
  message: string,
  scope: "release" | "track" | "row",
  context: Partial<Pick<CatalogImportIssue, "releaseTitle" | "trackTitle" | "isrc" | "upc">> = {},
) {
  issues.push({
    scope,
    code,
    message,
    releaseTitle: context.releaseTitle ?? null,
    trackTitle: context.trackTitle ?? null,
    isrc: context.isrc ?? null,
    upc: context.upc ?? null,
  })
}

function normalizeDateOrNull(value: unknown) {
  const trimmed = trimCell(value)

  if (!trimmed) {
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null
  }

  return trimmed
}

function normalizePositiveInteger(value: unknown) {
  const trimmed = trimCell(value)

  if (!trimmed) {
    return null
  }

  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const numeric = Number(trimmed)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function normalizeOptionalHttpUrl(value: unknown) {
  const trimmed = trimCell(value)

  if (!trimmed) {
    return null
  }

  try {
    const parsed = new URL(trimmed)

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }

    return parsed.toString()
  } catch {
    return null
  }
}

function normalizeReleaseFormat(value: unknown) {
  const normalized = trimCell(value).toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized === "single" || normalized === "ep" || normalized === "album") {
    return normalized
  }

  return null
}

function buildGroupKey(releaseTitle: string, releaseDate: string, upc: string | null) {
  if (upc) {
    return `upc:${upc}`
  }

  return `title:${releaseTitle.toLowerCase()}::${releaseDate}`
}

function detectReleaseType(trackCount: number, releaseFormat: string | null): ReleaseType {
  if (trackCount >= 7) {
    return "album"
  }

  if (trackCount >= 2 && releaseFormat === "album") {
    return "album"
  }

  if (trackCount >= 2) {
    return "ep"
  }

  return "single"
}

function prepareCatalogGroups(csvText: string) {
  let parsedRows: RawCatalogCsvRow[]

  try {
    parsedRows = parseCsv(csvText, {
      columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as RawCatalogCsvRow[]
  } catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: `Catalog CSV parse failed. ${error?.message || "Invalid CSV format."}`,
    })
  }

  const csvRows = parsedRows.filter((row) => hasCsvContent(row))

  if (!csvRows.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Catalog CSV is empty. Upload at least one data row.",
    })
  }

  const issues: CatalogImportIssue[] = []
  const groupMap = new Map<string, PreparedCatalogReleaseGroup>()
  const seenTrackKeys = new Set<string>()
  let parsedTrackCount = 0

  for (const [index, row] of csvRows.entries()) {
    const rowNumber = index + 2
    const releaseTitle = trimCell(row["release title"])
    const baseTrackTitle = trimCell(row["track title"])
    const isrc = trimCell(row.isrc).toUpperCase()

    if (!releaseTitle) {
      pushIssue(issues, "missing_release_title", `Row ${rowNumber} is missing Release Title.`, "row")
      continue
    }

    if (!baseTrackTitle) {
      pushIssue(issues, "missing_track_title", `Row ${rowNumber} is missing Track Title.`, "row", {
        releaseTitle,
      })
      continue
    }

    if (!isrc) {
      pushIssue(issues, "missing_isrc", `Row ${rowNumber} is missing ISRC.`, "row", {
        releaseTitle,
        trackTitle: baseTrackTitle,
      })
      continue
    }

    const releaseDate = normalizeDateOrNull(row["original release date"]) || normalizeDateOrNull(row["release date"])

    if (!releaseDate) {
      pushIssue(issues, "invalid_release_date", `Row ${rowNumber} is missing a valid release date.`, "row", {
        releaseTitle,
        trackTitle: baseTrackTitle,
        isrc,
        upc: trimCell(row.upc) || null,
      })
      continue
    }

    const versionLine = normalizeTrackVersion(row["track version"])
    const preparedRow: PreparedCatalogTrackRow = {
      releaseTitle,
      releaseDate,
      upc: trimCell(row.upc) || null,
      baseTrackTitle,
      trackTitle: trackTitleWithVersion(baseTrackTitle, versionLine),
      versionLine,
      isrc,
      trackNumber: normalizePositiveInteger(row["track listing"]),
      audioPreviewUrl: normalizeOptionalHttpUrl(row["track preview link"]),
      coverArtUrl: normalizeOptionalHttpUrl(row["artwork file"]),
      streamingLink: normalizeOptionalHttpUrl(row["release link"]),
      releaseFormat: normalizeReleaseFormat(row["release format"]),
      primaryArtistNames: parsePrimaryArtistNames(row["primary artist"]),
    }

    const groupKey = buildGroupKey(preparedRow.releaseTitle, preparedRow.releaseDate, preparedRow.upc)
    const trackKey = `${groupKey}::${preparedRow.isrc}`

    if (seenTrackKeys.has(trackKey)) {
      pushIssue(
        issues,
        "duplicate_track_in_file",
        `Row ${rowNumber} repeats ISRC ${preparedRow.isrc} for the same release group and was skipped.`,
        "track",
        {
          releaseTitle: preparedRow.releaseTitle,
          trackTitle: preparedRow.trackTitle,
          isrc: preparedRow.isrc,
          upc: preparedRow.upc,
        },
      )
      continue
    }

    seenTrackKeys.add(trackKey)
    parsedTrackCount += 1

    const existingGroup = groupMap.get(groupKey)

    if (existingGroup) {
      existingGroup.tracks.push(preparedRow)
      existingGroup.coverArtUrl = existingGroup.coverArtUrl || preparedRow.coverArtUrl
      existingGroup.streamingLink = existingGroup.streamingLink || preparedRow.streamingLink
      existingGroup.releaseFormat = existingGroup.releaseFormat || preparedRow.releaseFormat
    } else {
      groupMap.set(groupKey, {
        key: groupKey,
        title: preparedRow.releaseTitle,
        releaseDate: preparedRow.releaseDate,
        upc: preparedRow.upc,
        coverArtUrl: preparedRow.coverArtUrl,
        streamingLink: preparedRow.streamingLink,
        releaseFormat: preparedRow.releaseFormat,
        tracks: [preparedRow],
      })
    }
  }

  const groups = [...groupMap.values()]

  if (!groups.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Catalog CSV did not contain any valid release entries to import.",
    })
  }

  return {
    groups,
    issues,
    parsedTrackCount,
  }
}

async function fetchExistingReleases(supabase: SupabaseClient<any>, artistId: string, upcs: string[]) {
  const releaseByUpc = new Map<string, ExistingReleaseRow>()
  const releaseByArtistTitleDate = new Map<string, ExistingReleaseRow>()

  if (upcs.length) {
    const data = await fetchAllByChunks<ExistingReleaseRow, string>(
      upcs,
      "Unable to load existing releases by UPC.",
      (chunk, from, to) => supabase
        .from("releases")
        .select("id, artist_id, title, upc, release_date")
        .in("upc", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    )

    for (const release of data) {
      if (release.upc) {
        releaseByUpc.set(release.upc, release)
      }
    }
  }

  const artistReleaseRows = await fetchAllPages<ExistingReleaseRow>(
    "Unable to load existing artist releases.",
    (from, to) => supabase
      .from("releases")
      .select("id, artist_id, title, upc, release_date")
      .eq("artist_id", artistId)
      .order("id", { ascending: true })
      .range(from, to),
  )

  for (const release of artistReleaseRows) {
    if (release.release_date) {
      releaseByArtistTitleDate.set(buildGroupKey(release.title, release.release_date, null), release)
    }
  }

  return {
    releaseByUpc,
    releaseByArtistTitleDate,
  }
}

async function fetchExistingTracks(supabase: SupabaseClient<any>, artistId: string, isrcs: string[]) {
  const trackByIsrc = new Map<string, ExistingTrackRow>()

  if (!isrcs.length) {
    return trackByIsrc
  }

  const data = await fetchAllByChunks<ExistingTrackRow, string>(
    isrcs,
    "Unable to load existing tracks by ISRC.",
    (chunk, from, to) => supabase
      .from("tracks")
      .select("id, artist_id, isrc, title, version_line, release_id, releases!inner(artist_id, title)")
      .eq("artist_id", artistId)
      .in("isrc", chunk)
      .order("id", { ascending: true })
      .range(from, to),
  )

  for (const track of data) {
    trackByIsrc.set(track.isrc, track)
  }

  return trackByIsrc
}

async function fetchActiveArtistsByName(supabase: SupabaseClient<any>) {
  const artistByName = new Map<string, ArtistCreditRow>()
  const artistById = new Map<string, ArtistCreditRow>()
  const data = await fetchAllPages<ArtistCreditRow>(
    "Unable to load artists for catalog credits.",
    (from, to) => supabase
      .from("artists")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .range(from, to),
  )

  for (const artist of data) {
    artistById.set(artist.id, artist)
    artistByName.set(normalizeLookupKey(artist.name), artist)
  }

  return {
    artistById,
    artistByName,
  }
}

function primaryArtistNamesForTrack(track: PreparedCatalogTrackRow, fallbackArtistName: string | null) {
  if (track.primaryArtistNames.length) {
    return track.primaryArtistNames
  }

  return fallbackArtistName ? [fallbackArtistName] : []
}

async function syncPrimaryArtistCredits(
  supabase: SupabaseClient<any>,
  trackId: string,
  primaryArtistNames: string[],
  artistByName: Map<string, ArtistCreditRow>,
) {
  const { error: deleteError } = await supabase
    .from("track_credits")
    .delete()
    .eq("track_id", trackId)
    .eq("role_code", "Main Artist")

  if (deleteError) {
    throw createError({
      statusCode: 500,
      statusMessage: deleteError.message,
    })
  }

  if (!primaryArtistNames.length) {
    return
  }

  const { error: insertError } = await supabase.from("track_credits").insert(
    primaryArtistNames.map((creditedName, index) => {
      const linkedArtist = artistByName.get(normalizeLookupKey(creditedName))

      return {
        track_id: trackId,
        credited_name: creditedName,
        linked_artist_id: linkedArtist?.id ?? null,
        role_code: "Main Artist",
        sort_order: index,
      }
    }),
  )

  if (insertError) {
    throw createError({
      statusCode: 500,
      statusMessage: insertError.message,
    })
  }
}

async function updateExistingTrackMetadata(
  supabase: SupabaseClient<any>,
  existingTrack: ExistingTrackRow,
  track: PreparedCatalogTrackRow,
) {
  const update: Record<string, unknown> = {}

  if (existingTrack.title !== track.trackTitle) {
    update.title = track.trackTitle
  }

  if ((existingTrack.version_line ?? null) !== track.versionLine) {
    update.version_line = track.versionLine
  }

  if (!Object.keys(update).length) {
    return existingTrack
  }

  const { data, error } = await supabase
    .from("tracks")
    .update(update)
    .eq("id", existingTrack.id)
    .select("id, artist_id, isrc, title, version_line, release_id, releases!inner(artist_id, title)")
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || `Unable to update track ${track.trackTitle}.`,
    })
  }

  return data as ExistingTrackRow
}

export async function importCatalogCsv(
  supabase: SupabaseClient<any>,
  artistId: string,
  filename: string,
  csvText: string,
) {
  const byteLength = Buffer.byteLength(csvText, "utf8")

  if (byteLength > MAX_CSV_UPLOAD_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: `Catalog CSV exceeds the ${Math.round(MAX_CSV_UPLOAD_BYTES / (1024 * 1024))} MB limit.`,
    })
  }

  const { groups, issues, parsedTrackCount } = prepareCatalogGroups(csvText)
  const upcs = [...new Set(groups.map((group) => group.upc).filter((upc): upc is string => Boolean(upc)))]
  const isrcs = [...new Set(groups.flatMap((group) => group.tracks.map((track) => track.isrc)))]
  const { releaseByUpc, releaseByArtistTitleDate } = await fetchExistingReleases(supabase, artistId, upcs)
  const trackByIsrc = await fetchExistingTracks(supabase, artistId, isrcs)
  const { artistById, artistByName } = await fetchActiveArtistsByName(supabase)
  const fallbackArtistName = artistById.get(artistId)?.name ?? null

  let createdReleaseCount = 0
  let reusedReleaseCount = 0
  let createdTrackCount = 0
  let skippedTrackCount = 0

  for (const group of groups) {
    let releaseId = ""
    const existingByUpc = group.upc ? releaseByUpc.get(group.upc) : null
    const titleDateKey = buildGroupKey(group.title, group.releaseDate, null)
    const existingByArtistTitleDate = releaseByArtistTitleDate.get(titleDateKey)

    if (existingByUpc) {
      if (existingByUpc.artist_id !== artistId) {
        pushIssue(
          issues,
          "release_exists_other_artist",
          `UPC ${group.upc} already belongs to another artist and this release group was skipped.`,
          "release",
          {
            releaseTitle: group.title,
            upc: group.upc,
          },
        )
        skippedTrackCount += group.tracks.length
        continue
      }

      releaseId = existingByUpc.id
      reusedReleaseCount += 1
    } else if (existingByArtistTitleDate) {
      releaseId = existingByArtistTitleDate.id
      reusedReleaseCount += 1
    } else {
      const releaseType = detectReleaseType(group.tracks.length, group.releaseFormat)
      const { data, error } = await supabase
        .from("releases")
        .insert({
          artist_id: artistId,
          title: group.title,
          type: releaseType,
          upc: group.upc,
          cover_art_url: group.coverArtUrl,
          streaming_link: group.streamingLink,
          release_date: group.releaseDate,
          is_active: true,
        })
        .select("id, artist_id, title, upc, release_date")
        .single()

      if (error || !data) {
        throw createError({
          statusCode: 500,
          statusMessage: error?.message || `Unable to create release ${group.title}.`,
        })
      }

      releaseId = data.id
      createdReleaseCount += 1

      if (group.upc) {
        releaseByUpc.set(group.upc, data as ExistingReleaseRow)
      }

      releaseByArtistTitleDate.set(titleDateKey, data as ExistingReleaseRow)
    }

    for (const track of group.tracks) {
      const existingTrack = trackByIsrc.get(track.isrc)

      if (existingTrack) {
        if (existingTrack.release_id !== releaseId) {
          pushIssue(
            issues,
            "track_exists_other_release",
            `ISRC ${track.isrc} already exists on another release for this artist and was skipped.`,
            "track",
            {
              releaseTitle: group.title,
              trackTitle: track.trackTitle,
              isrc: track.isrc,
              upc: group.upc,
            },
          )
          skippedTrackCount += 1
          continue
        }

        const updatedTrack = await updateExistingTrackMetadata(supabase, existingTrack, track)
        trackByIsrc.set(track.isrc, updatedTrack)
        await syncPrimaryArtistCredits(
          supabase,
          updatedTrack.id,
          primaryArtistNamesForTrack(track, fallbackArtistName),
          artistByName,
        )
        skippedTrackCount += 1
        continue
      }

      const { data, error } = await supabase
        .from("tracks")
        .insert({
          release_id: releaseId,
          title: track.trackTitle,
          version_line: track.versionLine,
          isrc: track.isrc,
          track_number: track.trackNumber,
          audio_preview_url: track.audioPreviewUrl,
          is_active: true,
        })
        .select("id, artist_id, isrc, title, version_line, release_id, releases!inner(artist_id, title)")
        .single()

      if (error || !data) {
        throw createError({
          statusCode: 500,
          statusMessage: error?.message || `Unable to create track ${track.trackTitle}.`,
        })
      }

      trackByIsrc.set(track.isrc, data as ExistingTrackRow)
      await syncPrimaryArtistCredits(
        supabase,
        data.id,
        primaryArtistNamesForTrack(track, fallbackArtistName),
        artistByName,
      )
      createdTrackCount += 1
    }
  }

  return {
    filename,
    parsedReleaseCount: groups.length,
    parsedTrackCount,
    createdReleaseCount,
    reusedReleaseCount,
    createdTrackCount,
    skippedTrackCount,
    issues,
  } satisfies BulkCatalogImportResponse
}
