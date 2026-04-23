import { createError, readBody } from "h3"
import { serverSupabaseClient } from "~~/server/utils/supabase"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeBoolean, normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { ArtistNotificationMutationResponse, ArtistNotificationReadInput } from "~~/types/dashboard"

export default defineEventHandler(async (event) => {
  await requireArtistProfile(event)
  const notificationId = normalizeRequiredUuid(event.context.params?.id, "Notification id")
  const body = (await readBody<ArtistNotificationReadInput>(event)) ?? {}
  const isRead = normalizeBoolean(body.isRead, true)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: isRead })
    .eq("id", notificationId)
    .select("id")
    .maybeSingle()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Notification could not be found.",
    })
  }

  return {
    notificationId,
    updatedCount: 1,
  } satisfies ArtistNotificationMutationResponse
})
