import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireArtistProfile } from "~~/server/utils/auth"
import {
  normalizeOptionalText,
  normalizeReleaseChangeRequestType,
  normalizeRequiredText,
  normalizeRequiredUuid,
  normalizeStringArray,
} from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"
import type { CreateReleaseChangeRequestInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const body = await readBody<CreateReleaseChangeRequestInput>(event)
  const releaseId = normalizeRequiredUuid(body.releaseId, "Release")
  const requestType = normalizeReleaseChangeRequestType(body.requestType)
  const proofUrls = normalizeStringArray(body.proofUrls, "Proof URLs")
  const supabase = serverSupabaseServiceRole(event)

  const viewerArtistsResult = await supabase
    .from("artists")
    .select("id")
    .eq("user_id", profile.id)
    .eq("is_active", true)

  if (viewerArtistsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: viewerArtistsResult.error.message,
    })
  }

  const viewerArtistIds = ((viewerArtistsResult.data ?? []) as Array<{ id: string }>).map((artist) => artist.id)

  const releaseResult = await supabase
    .from("releases")
    .select("id, artist_id, status")
    .eq("id", releaseId)
    .single()

  if (releaseResult.error || !releaseResult.data) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release does not exist.",
    })
  }

  const release = releaseResult.data as { id: string; artist_id: string; status: string }

  if (!viewerArtistIds.includes(release.artist_id)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only the owning artist can submit catalog change requests for this release.",
    })
  }

  if (requestType === "draft_edit" && release.status !== "draft") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only draft releases can accept artist edit requests.",
    })
  }

  const openRequestResult = await supabase
    .from("release_change_requests")
    .select("id")
    .eq("release_id", releaseId)
    .eq("status", "pending")
    .limit(1)

  if (openRequestResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: openRequestResult.error.message,
    })
  }

  if ((openRequestResult.data ?? []).length) {
    throw createError({
      statusCode: 409,
      statusMessage: "There is already an open request for this release.",
    })
  }

  const providedSnapshot = body.snapshot ?? null

  if (requestType === "draft_edit" && !providedSnapshot) {
    throw createError({
      statusCode: 400,
      statusMessage: "A draft edit request must include the proposed release snapshot.",
    })
  }

  const snapshot = providedSnapshot ?? {
    release: {},
    tracks: [],
    credits: [],
    genre: null,
  }

  const takedownReason =
    requestType === "takedown"
      ? normalizeRequiredText(body.takedownReason, "Takedown reason")
      : normalizeOptionalText(body.takedownReason)

  const { error } = await supabase.from("release_change_requests").insert({
    release_id: releaseId,
    requester_artist_id: release.artist_id,
    requested_by: profile.id,
    request_type: requestType,
    status: "pending",
    proposed_release: snapshot.release ?? {},
    proposed_tracks: snapshot.tracks ?? [],
    proposed_credits: snapshot.credits ?? [],
    proposed_genre: snapshot.genre ?? null,
    takedown_reason: takedownReason,
    proof_urls: proofUrls,
  })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  await recordReleaseEvent(supabase, {
    releaseId,
    eventType: requestType === "draft_edit" ? "draft_edit_requested" : "takedown_requested",
    actorRole: "artist",
    actorProfileId: profile.id,
    actorArtistId: release.artist_id,
    payload: {
      requestType,
      reason: takedownReason,
      proofCount: proofUrls.length,
    },
  })

  return {
    ok: true,
  }
})
