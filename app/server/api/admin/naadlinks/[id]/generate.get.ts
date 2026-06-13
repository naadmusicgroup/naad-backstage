import { Buffer } from "node:buffer"
import { createError, getRouterParam, setHeader } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { sanitizeNaadLinkPayload } from "~~/server/utils/naadlinks"
import { buildNaadLinkZip } from "~~/server/utils/naadlinks-build"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Link id is required." })
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase
    .from("naad_links")
    .select("slug, payload")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 404, statusMessage: "Link not found." })
  }

  const slug = data.slug as string
  const payload = sanitizeNaadLinkPayload(data.payload)

  // The remote cover URL is used for social-share previews; we also try to
  // bundle the image so the deployed page is self-contained.
  const remoteCover = payload.track.coverArt
  let coverBuffer: Buffer | null = null
  if (/^https?:\/\//i.test(remoteCover)) {
    try {
      const bytes = (await $fetch(remoteCover, { responseType: "arrayBuffer" })) as ArrayBuffer
      coverBuffer = Buffer.from(bytes)
    } catch {
      coverBuffer = null
    }
  }

  const zip = await buildNaadLinkZip({
    slug,
    payload,
    coverBuffer,
    ogImageUrl: /^https?:\/\//i.test(remoteCover) ? remoteCover : "",
  })

  setHeader(event, "content-type", "application/zip")
  setHeader(event, "content-disposition", `attachment; filename="${slug}.zip"`)
  setHeader(event, "cache-control", "no-store")

  return zip
})
