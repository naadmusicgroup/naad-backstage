import { Buffer } from "node:buffer"
import type { SupabaseClient } from "@supabase/supabase-js"
import { parse as parseCsv } from "csv-parse/sync"
import { createError } from "h3"
import { MAX_CSV_UPLOAD_BYTES } from "~~/server/utils/imports"
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
  trackTitle: string
  isrc: string
  trackNumber: number | null
  audioPreviewUrl: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseFormat: string | null
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
  isrc: string
  title: string
  release_id: string
  releases: ExistingTrackReleaseJoinRow | ExistingTrackReleaseJoinRow[] | null
}

function trimCell(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value).trim()
}

function hasCsvContent(row: RawCatalogCsvRow) {
  return Object.values(row).some((value) => trimCell(value).length > 0)
}

function unwrapJoinRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value
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
    const trackTitle = trimCell(row["track title"])
    const isrc = trimCell(row.isrc).toUpperCase()

    if (!releaseTitle) {
      pushIssue(issues, "missing_release_title", `Row ${rowNumber} is missing Release Title.`, "row")
      continue
    }

    if (!trackTitle) {
      pushIssue(issues, "missing_track_title", `Row ${rowNumber} is missing Track Title.`, "row", {
        releaseTitle,
      })
      continue
    }

    if (!isrc) {
      pushIssue(issues, "missing_isrc", `Row ${rowNumber} is missing ISRC.`, "row", {
        releaseTitle,
        trackTitle,
      })
      continue
    }

    const releaseDate = normalizeDateOrNull(row["original release date"]) || normalizeDateOrNull(row["release date"])

    if (!releaseDate) {
      pushIssue(issues, "invalid_release_date", `Row ${rowNumber} is missing a valid release date.`, "row", {
        releaseTitle,
        trackTitle,
        isrc,
        upc: trimCell(row.upc) || null,
      })
      continue
    }

    const preparedRow: PreparedCatalogTrackRow = {
      releaseTitle,
      releaseDate,
      upc: trimCell(row.upc) || null,
      trackTitle,
      isrc,
      trackNumber: normalizePositiveInteger(row["track listing"]),
      audioPreviewUrl: normalizeOptionalHttpUrl(row["track preview link"]),
      coverArtUrl: normalizeOptionalHttpUrl(row["artwork file"]),
      streamingLink: normalizeOptionalHttpUrl(row["release link"]),
      releaseFormat: normalizeReleaseFormat(row["release format"]),
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
      statusMessage: "Catalog CSV did not contain any valid release rows to import.",
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
    const { data, error } = await supabase
      .from("releases")
      .select("id, artist_id, title, upc, release_date")
      .in("upc", upcs)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    for (const release of (data ?? []) as ExistingReleaseRow[]) {
      if (release.upc) {
        releaseByUpc.set(release.upc, release)
      }
    }
  }

  const { data: artistReleaseRows, error: artistReleaseError } = await supabase
    .from("releases")
    .select("id, artist_id, title, upc, release_date")
    .eq("artist_id", artistId)

  if (artistReleaseError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistReleaseError.message,
    })
  }

  for (const release of (artistReleaseRows ?? []) as ExistingReleaseRow[]) {
    if (release.release_date) {
      releaseByArtistTitleDate.set(buildGroupKey(release.title, release.release_date, null), release)
    }
  }

  return {
    releaseByUpc,
    releaseByArtistTitleDate,
  }
}

async function fetchExistingTracks(supabase: SupabaseClient<any>, isrcs: string[]) {
  const trackByIsrc = new Map<string, ExistingTrackRow>()

  if (!isrcs.length) {
    return trackByIsrc
  }

  const { data, error } = await supabase
    .from("tracks")
    .select("id, isrc, title, release_id, releases!inner(artist_id, title)")
    .in("isrc", isrcs)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  for (const track of (data ?? []) as ExistingTrackRow[]) {
    trackByIsrc.set(track.isrc, track)
  }

  return trackByIsrc
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
  const trackByIsrc = await fetchExistingTracks(supabase, isrcs)

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
        const existingTrackRelease = unwrapJoinRow(existingTrack.releases)

        if (existingTrackRelease?.artist_id !== artistId) {
          pushIssue(
            issues,
            "track_exists_other_artist",
            `ISRC ${track.isrc} already belongs to another artist and was skipped.`,
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

        skippedTrackCount += 1
        continue
      }

      const { data, error } = await supabase
        .from("tracks")
        .insert({
          release_id: releaseId,
          title: track.trackTitle,
          isrc: track.isrc,
          track_number: track.trackNumber,
          audio_preview_url: track.audioPreviewUrl,
          is_active: true,
        })
        .select("id, isrc, title, release_id, releases!inner(artist_id, title)")
        .single()

      if (error || !data) {
        throw createError({
          statusCode: 500,
          statusMessage: error?.message || `Unable to create track ${track.trackTitle}.`,
        })
      }

      trackByIsrc.set(track.isrc, data as ExistingTrackRow)
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
