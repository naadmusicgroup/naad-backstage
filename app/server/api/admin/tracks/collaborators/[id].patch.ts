import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  isSplitOverflowViolation,
  isUniqueViolation,
  mapTrackCollaboratorRecord,
  normalizeRequiredSplitPct,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import type { UpdateTrackCollaboratorInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const collaboratorId = normalizeRequiredUuid(event.context.params?.id, "Track collaborator id")

  const body = await readBody<UpdateTrackCollaboratorInput>(event)
  const update: Record<string, unknown> = {}
  const supabase = serverSupabaseServiceRole(event)

  if (body.artistId !== undefined) {
    update.artist_id = normalizeRequiredUuid(body.artistId, "Collaborator artist")
    await assertArtistExists(supabase, update.artist_id as string)
  }

  if (body.role !== undefined) {
    update.role = normalizeRequiredText(body.role, "Collaborator role")
  }

  if (body.splitPct !== undefined) {
    update.split_pct = normalizeRequiredSplitPct(body.splitPct, "Split percentage")
  }

  if (!Object.keys(update).length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No collaborator changes were provided.",
    })
  }

  const { data, error } = await supabase
    .from("track_collaborators")
    .update(update)
    .eq("id", collaboratorId)
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

  const collaboratorRecord = mapTrackCollaboratorRecord(data as any)

  await logAdminActivity(supabase, profile.id, "track.collaborator.updated", "track_collaborator", collaboratorId, {
    fields: Object.keys(update),
    track_id: collaboratorRecord.trackId,
    release_id: collaboratorRecord.releaseId,
  })

  return {
    ok: true,
    collaborator: collaboratorRecord,
  }
})
