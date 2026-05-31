import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchAllByChunks } from "~~/server/utils/supabase-pagination"
import type {
  AdminReleaseRecord,
  ArtistReleaseSubmissionRecord,
  ArtistReleaseSubmissionStatus,
  ArtistReleaseSubmissionTrackRecord,
  ReleaseDisplayStatus,
  ReleaseStatus,
} from "~~/types/catalog"

interface SubmissionArtistJoinRow {
  id: string
  name: string
}

interface SubmissionRow {
  id: string
  release_id: string
  artist_id: string
  submitted_by: string
  status: ArtistReleaseSubmissionStatus
  source_cover_art_url: string
  final_cover_art_url: string | null
  target_stores: string[] | string | null
  artist_notes: string | null
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  artists?: SubmissionArtistJoinRow | SubmissionArtistJoinRow[] | null
}

interface SubmissionTrackRow {
  id: string
  submission_id: string
  track_id: string
  source_audio_url: string
  final_audio_url: string | null
  source_filename: string | null
  created_at: string
  updated_at: string
}

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean)
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)).filter(Boolean) : []
    } catch {
      return []
    }
  }

  return [] as string[]
}

function isMissingSubmissionRelation(error: { message?: string } | null | undefined) {
  const message = error?.message ?? ""
  return /artist_release_submission/i.test(message) && /(does not exist|could not find|not found)/i.test(message)
}

export function releaseDisplayStatus(
  releaseStatus: ReleaseStatus,
  submission: Pick<ArtistReleaseSubmissionRecord, "status"> | null | undefined,
): ReleaseDisplayStatus {
  if (releaseStatus === "live" || releaseStatus === "taken_down" || releaseStatus === "deleted") {
    return releaseStatus
  }

  if (submission?.status === "pending_review") {
    return "pending_review"
  }

  if (submission?.status === "approved") {
    return "scheduled"
  }

  if (submission?.status === "rejected") {
    return "rejected"
  }

  return releaseStatus
}

function mapSubmissionRow(row: SubmissionRow, tracks: ArtistReleaseSubmissionTrackRecord[]): ArtistReleaseSubmissionRecord {
  const artist = unwrapJoinRow(row.artists)

  return {
    id: row.id,
    releaseId: row.release_id,
    artistId: row.artist_id,
    artistName: artist?.name ?? null,
    submittedByProfileId: row.submitted_by,
    submittedByName: null,
    status: row.status,
    sourceCoverArtUrl: row.source_cover_art_url,
    finalCoverArtUrl: row.final_cover_art_url,
    targetStores: normalizeStringArray(row.target_stores),
    artistNotes: row.artist_notes,
    adminNotes: row.admin_notes,
    reviewedByProfileId: row.reviewed_by,
    reviewedByName: null,
    reviewedAt: row.reviewed_at,
    tracks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSubmissionTrackRow(row: SubmissionTrackRow): ArtistReleaseSubmissionTrackRecord {
  return {
    id: row.id,
    submissionId: row.submission_id,
    trackId: row.track_id,
    sourceAudioUrl: row.source_audio_url,
    finalAudioUrl: row.final_audio_url,
    sourceFilename: row.source_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function loadReleaseSubmissionsByReleaseIds(
  supabase: SupabaseClient<any>,
  releaseIds: string[],
) {
  const submissionByReleaseId = new Map<string, ArtistReleaseSubmissionRecord>()

  if (!releaseIds.length) {
    return submissionByReleaseId
  }

  let submissions: SubmissionRow[]

  try {
    submissions = await fetchAllByChunks<SubmissionRow, string>(
      releaseIds,
      "Unable to load release submissions.",
      (chunk, from, to) => supabase
        .from("artist_release_submissions")
        .select(
          "id, release_id, artist_id, submitted_by, status, source_cover_art_url, final_cover_art_url, target_stores, artist_notes, admin_notes, reviewed_by, reviewed_at, created_at, updated_at, artists(id, name)",
        )
        .in("release_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    )
  } catch (error: any) {
    if (isMissingSubmissionRelation(error)) {
      return submissionByReleaseId
    }

    throw error
  }

  const submissionIds = submissions.map((row) => row.id)
  const tracksBySubmissionId = new Map<string, ArtistReleaseSubmissionTrackRecord[]>()

  if (submissionIds.length) {
    let trackRows: SubmissionTrackRow[]

    try {
      trackRows = await fetchAllByChunks<SubmissionTrackRow, string>(
        submissionIds,
        "Unable to load release submission tracks.",
        (chunk, from, to) => supabase
          .from("artist_release_submission_tracks")
          .select("id, submission_id, track_id, source_audio_url, final_audio_url, source_filename, created_at, updated_at")
          .in("submission_id", chunk)
          .order("id", { ascending: true })
          .range(from, to),
      )
    } catch (error: any) {
      if (isMissingSubmissionRelation(error)) {
        return submissionByReleaseId
      }

      throw error
    }

    for (const row of trackRows) {
      const tracks = tracksBySubmissionId.get(row.submission_id) ?? []
      tracks.push(mapSubmissionTrackRow(row))
      tracksBySubmissionId.set(row.submission_id, tracks)
    }
  }

  for (const row of submissions) {
    submissionByReleaseId.set(row.release_id, mapSubmissionRow(row, tracksBySubmissionId.get(row.id) ?? []))
  }

  return submissionByReleaseId
}

export function applySubmissionDisplayState(release: AdminReleaseRecord, submission: ArtistReleaseSubmissionRecord | null) {
  release.submission = submission
  release.displayStatus = releaseDisplayStatus(release.status, submission)

  if (submission) {
    for (const track of release.tracks) {
      const submissionTrack = submission.tracks.find((item) => item.trackId === track.id)
      track.sourceAudioUrl = submissionTrack?.sourceAudioUrl ?? null
      track.finalAudioUrl = submissionTrack?.finalAudioUrl ?? null
    }
  }

  return release
}
