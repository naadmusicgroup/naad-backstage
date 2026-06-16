import { createError, getRouterParam, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { mapNaadLinkRow, NAAD_LINK_COLUMNS, normalizeSubdomain } from "~~/server/utils/naadlinks"
import { getFtpConfig, subdomainDocroot, subdomainExists } from "~~/server/utils/ftp-deploy"

interface Body {
  subdomain?: string
}

/**
 * Saves the subdomain for a NaadLink and verifies (over FTP) that its document
 * root already exists on the server. Subdomains are created manually in cPanel
 * — Imunify360 blocks the cPanel API, so we can't create them programmatically.
 */
export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const id = getRouterParam(event, "id")
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Link id is required." })
  }

  const body = await readBody<Body>(event)
  const label = normalizeSubdomain(body.subdomain)
  if (!label) {
    throw createError({ statusCode: 400, statusMessage: "Enter a subdomain (letters, numbers, hyphens)." })
  }

  const config = getFtpConfig()
  const exists = await subdomainExists(label)

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase
    .from("naad_links")
    .update({ subdomain: label, subdomain_verified: exists })
    .eq("id", id)
    .select(NAAD_LINK_COLUMNS)
    .single()

  if (error) {
    if (error.code === "23505") {
      throw createError({ statusCode: 409, statusMessage: `Subdomain "${label}" is already used by another link.` })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    link: mapNaadLinkRow(data),
    subdomain: label,
    domain: `${label}.${config.rootDomain}`,
    docroot: subdomainDocroot(label, config),
    exists,
  }
})
