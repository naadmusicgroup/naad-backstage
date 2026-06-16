import { Buffer } from "node:buffer"
import { createError, getRouterParam } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { mapNaadLinkRow, NAAD_LINK_COLUMNS, normalizeSubdomain, sanitizeNaadLinkPayload } from "~~/server/utils/naadlinks"
import { buildNaadLinkFiles } from "~~/server/utils/naadlinks-build"
import { deployViaFtp, getFtpConfig } from "~~/server/utils/ftp-deploy"

/**
 * Builds the release page and pushes it into <subdomain>.naad.link/<slug> over
 * FTP. Records the deploy outcome on the row for the admin UI.
 */
export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Link id is required." })
  }

  const supabase = serverSupabaseServiceRole(event)

  const { data: row, error } = await supabase
    .from("naad_links")
    .select("slug, payload, subdomain, release_id")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: "Link not found." })
  }

  const label = normalizeSubdomain(row.subdomain)
  if (!label) {
    throw createError({ statusCode: 400, statusMessage: "Set a subdomain for this link before deploying." })
  }

  const slug = row.slug as string
  const payload = sanitizeNaadLinkPayload(row.payload)
  const { rootDomain } = getFtpConfig()
  const domain = `${label}.${rootDomain}`

  // Mark as deploying so a refresh mid-flight shows progress.
  await supabase.from("naad_links").update({ deploy_status: "deploying" }).eq("id", id)

  // Bundle the cover so the page is self-contained (same as the ZIP path).
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

  try {
    const files = await buildNaadLinkFiles({
      slug,
      payload,
      coverBuffer,
      ogImageUrl: /^https?:\/\//i.test(remoteCover) ? remoteCover : `https://${domain}/${slug}/cover.jpg`,
      basePath: `/${slug}`,
    })

    const result = await deployViaFtp({
      subdomain: label,
      slug,
      files,
    })

    const url = `https://${domain}/${slug}`

    const { data: updated } = await supabase
      .from("naad_links")
      .update({ deploy_status: "live", deployed_at: new Date().toISOString(), deploy_error: null })
      .eq("id", id)
      .select(NAAD_LINK_COLUMNS)
      .single()

    // Auto-fill the release's streaming link with the freshly-deployed page so
    // it propagates to the catalog/dashboard without a manual copy-paste.
    if (row.release_id) {
      await supabase.from("releases").update({ streaming_link: url }).eq("id", row.release_id)
    }

    return {
      ok: true,
      url,
      ...result,
      link: updated ? mapNaadLinkRow(updated) : null,
    }
  } catch (caught: any) {
    const message = caught?.statusMessage || caught?.message || "Deployment failed."
    await supabase
      .from("naad_links")
      .update({ deploy_status: "failed", deploy_error: message })
      .eq("id", id)
    throw createError({ statusCode: caught?.statusCode || 502, statusMessage: message })
  }
})
