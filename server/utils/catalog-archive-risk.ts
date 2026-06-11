import type { SupabaseClient } from "@supabase/supabase-js"
import Decimal from "decimal.js"
import { createError } from "h3"
import type { AdminArchiveRiskResponse, AdminArchiveRiskTrack, TrackStatus } from "~~/types/catalog"

const PAGE_SIZE = 1000

interface ReleaseRiskRow {
  id: string
  title: string
  upc: string | null
}

interface TrackRiskRow {
  id: string
  release_id: string
  title: string
  isrc: string
  version_line: string | null
  status: TrackStatus | null
  track_number: number | null
}

interface TrackWithReleaseRiskRow extends TrackRiskRow {
  releases: ReleaseRiskRow | ReleaseRiskRow[] | null
}

interface EarningRiskRow {
  id: string
  track_id: string
  total_amount: string | number | null
  upload_id: string | null
}

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : (value ?? null)
}

async function fetchPaged<T>(query: any, label: string) {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message || label,
      })
    }

    rows.push(...((data ?? []) as T[]))

    if (!data || data.length < PAGE_SIZE) {
      break
    }
  }

  return rows
}

function sumEarnings(rows: EarningRiskRow[]) {
  return rows.reduce((sum, row) => sum.add(row.total_amount ?? 0), new Decimal(0)).toFixed(8)
}

function toTrackStatus(status: TrackStatus | null | undefined) {
  return status === "draft" || status === "deleted" ? status : "live"
}

function buildTrackRisk(track: TrackRiskRow, earnings: EarningRiskRow[]): AdminArchiveRiskTrack {
  return {
    id: track.id,
    title: track.title,
    isrc: track.isrc,
    versionLine: track.version_line ?? null,
    status: toTrackStatus(track.status),
    earningsRowCount: earnings.length,
    earningsTotal: sumEarnings(earnings),
  }
}

export async function getReleaseArchiveRisk(
  supabase: SupabaseClient<any>,
  releaseId: string,
): Promise<AdminArchiveRiskResponse> {
  const { data: release, error: releaseError } = await supabase
    .from("releases")
    .select("id, title, upc")
    .eq("id", releaseId)
    .maybeSingle()

  if (releaseError) {
    throw createError({
      statusCode: 500,
      statusMessage: releaseError.message,
    })
  }

  if (!release) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release does not exist.",
    })
  }

  const tracks = await fetchPaged<TrackRiskRow>(
    supabase
      .from("tracks")
      .select("id, release_id, title, isrc, version_line, status, track_number")
      .eq("release_id", releaseId)
      .order("track_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    "Unable to load release tracks.",
  )
  const earnings = await fetchPaged<EarningRiskRow>(
    supabase
      .from("earnings")
      .select("id, track_id, total_amount, upload_id")
      .eq("release_id", releaseId)
      .order("id", { ascending: true }),
    "Unable to load release earnings.",
  )
  const uploads = new Set(earnings.map((earning) => earning.upload_id).filter(Boolean))
  const earningsByTrackId = new Map<string, EarningRiskRow[]>()

  for (const earning of earnings) {
    const trackRows = earningsByTrackId.get(earning.track_id) ?? []
    trackRows.push(earning)
    earningsByTrackId.set(earning.track_id, trackRows)
  }

  return {
    scope: "release",
    releaseId: release.id,
    releaseTitle: release.title,
    releaseUpc: release.upc ?? null,
    trackId: null,
    tracks: tracks.map((track) => buildTrackRisk(track, earningsByTrackId.get(track.id) ?? [])),
    earningsRowCount: earnings.length,
    earningsTotal: sumEarnings(earnings),
    affectedUploadCount: uploads.size,
    hasEarnings: earnings.length > 0,
  }
}

export async function getTrackArchiveRisk(
  supabase: SupabaseClient<any>,
  trackId: string,
): Promise<AdminArchiveRiskResponse> {
  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .select("id, release_id, title, isrc, version_line, status, track_number, releases!inner(id, title, upc)")
    .eq("id", trackId)
    .maybeSingle()

  if (trackError) {
    throw createError({
      statusCode: 500,
      statusMessage: trackError.message,
    })
  }

  if (!track) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected track does not exist.",
    })
  }

  const release = unwrapJoinRow((track as TrackWithReleaseRiskRow).releases)
  const earnings = await fetchPaged<EarningRiskRow>(
    supabase
      .from("earnings")
      .select("id, track_id, total_amount, upload_id")
      .eq("track_id", trackId)
      .order("id", { ascending: true }),
    "Unable to load track earnings.",
  )
  const uploads = new Set(earnings.map((earning) => earning.upload_id).filter(Boolean))

  return {
    scope: "track",
    releaseId: track.release_id,
    releaseTitle: release?.title ?? "Unknown release",
    releaseUpc: release?.upc ?? null,
    trackId: track.id,
    tracks: [buildTrackRisk(track as TrackRiskRow, earnings)],
    earningsRowCount: earnings.length,
    earningsTotal: sumEarnings(earnings),
    affectedUploadCount: uploads.size,
    hasEarnings: earnings.length > 0,
  }
}
