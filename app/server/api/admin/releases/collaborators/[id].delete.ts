import { createError } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const collaboratorId = normalizeRequiredUuid(event.context.params?.id, "Release collaborator id")
  const supabase = serverSupabaseServiceRole(event)

  const { data: existing, error: existingError } = await supabase
    .from("release_collaborators")
    .select("id, release_id, artist_id, role, split_pct")
    .eq("id", collaboratorId)
    .maybeSingle()

  if (existingError) {
    throw createError({
      statusCode: 500,
      statusMessage: existingError.message,
    })
  }

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "That release collaborator could not be found.",
    })
  }

  const { error } = await supabase
    .from("release_collaborators")
    .delete()
    .eq("id", collaboratorId)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "release.collaborator.deleted", "release_collaborator", collaboratorId, {
    release_id: existing.release_id,
    artist_id: existing.artist_id,
    role: existing.role,
    split_pct: existing.split_pct,
  })

  return {
    ok: true,
    id: collaboratorId,
  }
})
