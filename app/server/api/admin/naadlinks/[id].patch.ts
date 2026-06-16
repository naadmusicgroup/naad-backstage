import { createError, getRouterParam, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { mapNaadLinkRow, NAAD_LINK_COLUMNS, normalizeSlug, normalizeSubdomain, sanitizeNaadLinkPayload } from "~~/server/utils/naadlinks"

interface UpdateBody {
  slug?: string
  payload?: unknown
  status?: string
  subdomain?: string | null
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

  const supabase = serverSupabaseServiceRole(event)

  if (body.subdomain !== undefined) {
    const nextSubdomain = body.subdomain ? normalizeSubdomain(body.subdomain) || null : null
    update.subdomain = nextSubdomain

    // Changing the subdomain invalidates a prior FTP verification.
    const { data: current } = await supabase
      .from("naad_links")
      .select("subdomain")
      .eq("id", id)
      .maybeSingle()
    if (current && current.subdomain !== nextSubdomain) {
      update.subdomain_verified = false
    }
  }

  if (!Object.keys(update).length) {
    throw createError({ statusCode: 400, statusMessage: "Nothing to update." })
  }

  const { data, error } = await supabase
    .from("naad_links")
    .update(update)
    .eq("id", id)
    .select(NAAD_LINK_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") {
      const which = /subdomain/i.test(error.message) ? "subdomain" : "slug"
      throw createError({ statusCode: 409, statusMessage: `That ${which} is already in use.` })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { link: mapNaadLinkRow(data) }
})
