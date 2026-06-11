import { getQuery } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  loadAdminPublishingWriters,
  normalizeAdminPublishingWriterStatusQuery,
} from "~~/server/utils/publishing-registration"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const status = normalizeAdminPublishingWriterStatusQuery(query.status)
  const supabase = serverSupabaseServiceRole(event)

  return loadAdminPublishingWriters(supabase, status)
})
