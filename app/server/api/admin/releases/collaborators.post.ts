import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  assertReleaseExists,
  isSplitOverflowViolation,
  isUniqueViolation,
  mapReleaseCollaboratorRecord,
  normalizeRequiredSplitPct,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import type { CreateReleaseCollaboratorInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)

  const body = await readBody<CreateReleaseCollaboratorInput>(event)
  const releaseId = normalizeRequiredUuid(body.releaseId, "Release")
  const artistId = normalizeRequiredUuid(body.artistId, "Collaborator artist")
  const role = normalizeRequiredText(body.role, "Collaborator role")
  const splitPct = normalizeRequiredSplitPct(body.splitPct, "Split percentage")
  const supabase = serverSupabaseServiceRole(event)

  await assertReleaseExists(supabase, releaseId)
  const artist = await assertArtistExists(supabase, artistId)

  const { data, error } = await supabase
    .from("release_collaborators")
    .insert({
      release_id: releaseId,
      artist_id: artistId,
      role,
      split_pct: splitPct,
    })
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

  await logAdminActivity(supabase, profile.id, "release.collaborator.created", "release_collaborator", data.id, {
    release_id: releaseId,
    artist_id: artistId,
    artist_name: artist.name,
    role,
    split_pct: splitPct,
  })

  return {
    ok: true,
    collaborator: mapReleaseCollaboratorRecord(data as any),
  }
})
