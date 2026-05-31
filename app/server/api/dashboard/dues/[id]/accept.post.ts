import { createError } from "h3"
import { serverSupabaseClient } from "~~/server/utils/supabase"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { statusCodeForDuesRpcError } from "~~/server/utils/dues"
import type { ArtistDueMutationResponse } from "~~/types/dashboard"

export default defineEventHandler(async (event) => {
  await requireArtistProfile(event)
  const dueId = normalizeRequiredUuid(event.context.params?.id, "Due id")
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase.rpc("accept_due_charge", {
    target_due_id: dueId,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForDuesRpcError(error),
      statusMessage: error?.message || "Unable to accept this due.",
    })
  }

  return data as ArtistDueMutationResponse
})
