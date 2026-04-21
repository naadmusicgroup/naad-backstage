import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  isSplitOverflowViolation,
  isUniqueViolation,
  mapReleaseCollaboratorRecord,
  normalizeRequiredSplitPct,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import type { UpdateReleaseCollaboratorInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const collaboratorId = normalizeRequiredUuid(event.context.params?.id, "Release collaborator id")

  const body = await readBody<UpdateReleaseCollaboratorInput>(event)
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
    .from("release_collaborators")
    .update(update)
    .eq("id", collaboratorId)
    .select("id, release_id, artist_id, role, split_pct, created_at, updated_at, artists!inner(id, name)")
    .single()

  if (error) {
    throw createError({
      statusCode: isUniqueViolation(error) || isSplitOverflowViolation(error) ? 409 : 500,
      statusMessage: isUniqueViolation(error)
        ? "That collaborator role already exists on this release."
        : isSplitOverflowViolation(error)
          ? "Release collaborator splits cannot exceed 100%."
          : error.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "release.collaborator.updated", "release_collaborator", collaboratorId, {
    fields: Object.keys(update),
    release_id: data.release_id,
  })

  return {
    ok: true,
    collaborator: mapReleaseCollaboratorRecord(data as any),
  }
})
