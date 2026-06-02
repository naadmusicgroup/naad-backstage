import { createError, readBody } from "h3"
import { serverSupabaseClient } from "~~/server/utils/supabase"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { consumeRateLimit, requestRateLimitKey } from "~~/server/utils/rate-limit"
import { resolveNotificationScopeArtists } from "~~/server/utils/notifications"
import type { ArtistNotificationMutationResponse, ArtistNotificationsMarkReadInput } from "~~/types/dashboard"

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  consumeRateLimit({
    key: requestRateLimitKey(event, "artist-notifications-mark-read", profile.id),
    limit: 30,
    windowMs: 60 * 1000,
    message: "Too many notification updates. Try again later.",
  })
  const body = (await readBody<ArtistNotificationsMarkReadInput>(event)) ?? {}
  const requestedArtistId = body.artistId ? normalizeRequiredUuid(body.artistId, "Artist id") : ""
  const supabase = await serverSupabaseClient(event)
  const artists = await resolveNotificationScopeArtists(supabase, profile.id, requestedArtistId)
  const artistIds = artists.map((artist) => artist.id)

  if (!artistIds.length) {
    return {
      updatedCount: 0,
    } satisfies ArtistNotificationMutationResponse
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("artist_id", artistIds)
    .eq("is_read", false)
    .select("id")

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to update notifications.",
    })
  }

  return {
    updatedCount: data?.length ?? 0,
  } satisfies ArtistNotificationMutationResponse
})
