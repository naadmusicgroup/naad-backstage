import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeSubdomain } from "~~/server/utils/naadlinks"
import { getFtpConfig, subdomainDocroot, subdomainExists } from "~~/server/utils/ftp-deploy"

interface Body {
  artistId?: string
  subdomain?: string
}

/**
 * Verifies (over FTP) that an artist's subdomain document root exists, and
 * remembers the result per artist so it never has to be re-verified. No slug
 * or saved link is required — this is purely an artist-level FTP check.
 */
export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const body = await readBody<Body>(event)

  const artistId = (body.artistId || "").trim()
  if (!artistId) {
    throw createError({ statusCode: 400, statusMessage: "Select an artist before verifying." })
  }
  const label = normalizeSubdomain(body.subdomain)
  if (!label) {
    throw createError({ statusCode: 400, statusMessage: "Enter a subdomain to verify." })
  }

  const config = getFtpConfig()
  const exists = await subdomainExists(label)

  const supabase = serverSupabaseServiceRole(event)
  const { error } = await supabase
    .from("naadlink_subdomains")
    .upsert(
      {
        artist_id: artistId,
        subdomain: label,
        verified: exists,
        verified_at: exists ? new Date().toISOString() : null,
      },
      { onConflict: "artist_id" },
    )

  if (error) {
    if (error.code === "23505") {
      throw createError({ statusCode: 409, statusMessage: `Subdomain "${label}" is already used by another artist.` })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    subdomain: label,
    domain: `${label}.${config.rootDomain}`,
    docroot: subdomainDocroot(label, config),
    verified: exists,
    exists,
  }
})
