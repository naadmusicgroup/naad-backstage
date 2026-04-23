import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  normalizeEffectivePeriodMonth,
  normalizeOptionalText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import {
  normalizePublishingAmount,
  statusCodeForPublishingRpcError,
} from "~~/server/utils/publishing"
import type {
  AdminPublishingMutationInput,
  AdminPublishingMutationResponse,
} from "~~/types/admin"

function normalizeOptionalReleaseId(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "none") {
    return null
  }

  return normalizeRequiredUuid(value, "Release id")
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<AdminPublishingMutationInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist id")
  const releaseId = normalizeOptionalReleaseId(body.releaseId)
  const amount = normalizePublishingAmount(body.amount)
  const periodMonth = normalizeEffectivePeriodMonth(body.periodMonth, "Period month")
  const notes = normalizeOptionalText(body.notes)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("create_publishing_earning", {
    target_artist_id: artistId,
    target_release_id: releaseId,
    target_amount: amount,
    target_period_month: periodMonth,
    target_notes: notes,
    actor_admin_id: profile.id,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPublishingRpcError(error),
      statusMessage: error?.message || "Unable to create this publishing credit.",
    })
  }

  const result = data as AdminPublishingMutationResponse

  await logAdminActivity(supabase, profile.id, "publishing.created", "publishing_earning", result.entryId, {
    artist_id: artistId,
    release_id: releaseId,
    amount,
    period_month: periodMonth,
    ledger_entry_id: result.ledgerEntryId,
  })

  return result
})
