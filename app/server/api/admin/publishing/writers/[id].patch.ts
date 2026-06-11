import { readBody } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { updateAdminPublishingWriter } from "~~/server/utils/publishing-registration"
import type { AdminPublishingWriterUpdateInput } from "~~/types/publishing"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const writerId = normalizeRequiredUuid(event.context.params?.id, "Writer")
  const body = await readBody<AdminPublishingWriterUpdateInput>(event)
  const supabase = serverSupabaseServiceRole(event)
  const result = await updateAdminPublishingWriter(supabase, writerId, body ?? {})

  await logAdminActivity(supabase, profile.id, "publishing.writer.updated", "publishing_writer", result.writer?.id ?? writerId, {
    requested_writer_id: writerId,
    merged_into_writer_id: result.mergedIntoWriterId,
  })

  return result
})
