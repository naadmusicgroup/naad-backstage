import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { deleteOrArchiveAdminPublishingWriter } from "~~/server/utils/publishing-registration"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const writerId = normalizeRequiredUuid(event.context.params?.id, "Writer")
  const supabase = serverSupabaseServiceRole(event)
  const result = await deleteOrArchiveAdminPublishingWriter(supabase, writerId, profile.id)

  await logAdminActivity(
    supabase,
    profile.id,
    result.archived ? "publishing.writer.archived" : "publishing.writer.deleted",
    "publishing_writer",
    writerId,
    {
      archived: result.archived,
      deleted: result.deleted,
    },
  )

  return result
})
