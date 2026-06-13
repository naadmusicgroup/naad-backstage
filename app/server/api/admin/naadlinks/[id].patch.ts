import { createError, getRouterParam, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { mapNaadLinkRow, normalizeSlug, sanitizeNaadLinkPayload } from "~~/server/utils/naadlinks"

interface UpdateBody {
  slug?: string
  payload?: unknown
  status?: string
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Link id is required." })
  }

  const body = await readBody<UpdateBody>(event)
  const update: Record<string, unknown> = {}

  if (body.slug !== undefined) {
    const slug = normalizeSlug(body.slug)
    if (!slug) {
      throw createError({ statusCode: 400, statusMessage: "A link slug is required." })
    }
    update.slug = slug
  }

  if (body.payload !== undefined) {
    const payload = sanitizeNaadLinkPayload(body.payload)
    if (!payload.track.title || !payload.artist.name) {
      throw createError({ statusCode: 400, statusMessage: "Artist name and song title are required." })
    }
    update.payload = payload
    update.title = payload.track.title
    update.artist_name = payload.artist.name
  }

  if (body.status !== undefined && (body.status === "active" || body.status === "archived")) {
    update.status = body.status
  }

  if (!Object.keys(update).length) {
    throw createError({ statusCode: 400, statusMessage: "Nothing to update." })
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase
    .from("naad_links")
    .update(update)
    .eq("id", id)
    .select("id, slug, artist_id, release_id, track_id, title, artist_name, payload, status, created_at, updated_at")
    .single()

  if (error) {
    if (error.code === "23505") {
      throw createError({ statusCode: 409, statusMessage: "That slug is already in use." })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { link: mapNaadLinkRow(data) }
})
