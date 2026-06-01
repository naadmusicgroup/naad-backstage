import { createError, readBody } from "h3"
import { serverSupabaseClient } from "~~/server/utils/supabase"
import { requireArtistProfile } from "~~/server/utils/auth"
import { sendAdminDashboardAlertEmail } from "~~/server/utils/email"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import {
  normalizeOptionalPayoutNotes,
  normalizeRequiredPayoutAmount,
  statusCodeForPayoutRpcError,
} from "~~/server/utils/payouts"
import type { CreatePayoutRequestInput, PayoutMutationResponse } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  await requireArtistProfile(event)
  const body = await readBody<CreatePayoutRequestInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const amount = normalizeRequiredPayoutAmount(body.amount)
  const artistNotes = normalizeOptionalPayoutNotes(body.artistNotes)
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase.rpc("create_payout_request", {
    target_artist_id: artistId,
    request_amount: amount,
    request_notes: artistNotes,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPayoutRpcError(error),
      statusMessage: error?.message || "Unable to create this payout request.",
    })
  }

  const result = data as PayoutMutationResponse
  const { data: artist } = await supabase
    .from("artists")
    .select("name")
    .eq("id", artistId)
    .maybeSingle<{ name: string }>()

  await sendAdminDashboardAlertEmail(event, {
    subject: "New payout request in Naad Backstage",
    title: "New payout request",
    lines: [
      `${artist?.name ?? "An artist"} requested a payout of $${amount}.`,
      artistNotes ? `Artist note: ${artistNotes}` : "Review the request from the admin payout queue.",
    ],
    actionPath: "/admin/payouts",
    actionLabel: "Review payout",
  })

  return result
})

