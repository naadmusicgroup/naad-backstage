import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  normalizeOptionalIsoDate,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import {
  normalizeDueAmount,
  statusCodeForDuesRpcError,
} from "~~/server/utils/dues"
import type { AdminDueMutationInput, AdminDueMutationResponse } from "~~/types/admin"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<AdminDueMutationInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist id")
  const title = normalizeRequiredText(body.title, "Due title", 2)
  const amount = normalizeDueAmount(body.amount)
  const dueDate = normalizeOptionalIsoDate(body.dueDate, "Due date")
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("create_due_charge", {
    target_artist_id: artistId,
    target_title: title,
    target_amount: amount,
    target_due_date: dueDate,
    actor_admin_id: profile.id,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForDuesRpcError(error),
      statusMessage: error?.message || "Unable to create this due.",
    })
  }

  const result = data as AdminDueMutationResponse

  await logAdminActivity(supabase, profile.id, "due.created", "due", result.dueId, {
    artist_id: artistId,
    title,
    amount,
    due_date: dueDate,
    ledger_entry_id: result.ledgerEntryId,
  })

  return result
})
