import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { restoreAdminPublishingWriter } from "~~/server/utils/publishing-registration"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const writerId = normalizeRequiredUuid(event.context.params?.id, "Writer")
  const supabase = serverSupabaseServiceRole(event)
  const result = await restoreAdminPublishingWriter(supabase, writerId)

  await logAdminActivity(supabase, profile.id, "publishing.writer.restored", "publishing_writer", result.writer?.id ?? writerId, {
    requested_writer_id: writerId,
    merged_into_writer_id: result.mergedIntoWriterId,
  })

  return result
})
