import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { mapNaadLinkRow, normalizeSlug, sanitizeNaadLinkPayload } from "~~/server/utils/naadlinks"

interface CreateBody {
  slug?: string
  artistId?: string | null
  releaseId?: string | null
  trackId?: string | null
  payload?: unknown
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<CreateBody>(event)

  const slug = normalizeSlug(body.slug)
  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: "A link slug is required (letters, numbers, hyphens)." })
  }

  const payload = sanitizeNaadLinkPayload(body.payload)
  if (!payload.track.title || !payload.artist.name) {
    throw createError({ statusCode: 400, statusMessage: "Artist name and song title are required." })
  }

  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase
    .from("naad_links")
    .insert({
      slug,
      artist_id: body.artistId ?? null,
      release_id: body.releaseId ?? null,
      track_id: body.trackId ?? null,
      title: payload.track.title,
      artist_name: payload.artist.name,
      payload,
      created_by: profile.id,
    })
    .select("id, slug, artist_id, release_id, track_id, title, artist_name, payload, status, created_at, updated_at")
    .single()

  if (error) {
    if (error.code === "23505") {
      throw createError({ statusCode: 409, statusMessage: `A link with the slug "${slug}" already exists.` })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { link: mapNaadLinkRow(data) }
})
