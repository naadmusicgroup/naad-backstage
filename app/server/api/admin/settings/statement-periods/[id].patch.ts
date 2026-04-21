import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { UpdateStatementPeriodStatusInput } from "~~/types/settings"

function normalizeStatementStatus(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (normalized !== "open" && normalized !== "closed") {
    throw createError({
      statusCode: 400,
      statusMessage: "Statement period status must be open or closed.",
    })
  }

  return normalized as "open" | "closed"
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const statementPeriodId = normalizeRequiredUuid(event.context.params?.id, "Statement period id")
  const body = await readBody<UpdateStatementPeriodStatusInput>(event)
  const nextStatus = normalizeStatementStatus(body?.status)
  const supabase = serverSupabaseServiceRole(event)

  const { data: existingPeriod, error: existingPeriodError } = await supabase
    .from("statement_periods")
    .select("id, artist_id, period_month, status, closed_at, closed_by")
    .eq("id", statementPeriodId)
    .maybeSingle<{
      id: string
      artist_id: string
      period_month: string
      status: "open" | "closed"
      closed_at: string | null
      closed_by: string | null
    }>()

  if (existingPeriodError) {
    throw createError({
      statusCode: 500,
      statusMessage: existingPeriodError.message,
    })
  }

  if (!existingPeriod) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected statement period does not exist.",
    })
  }

  if (existingPeriod.status === nextStatus) {
    return {
      ok: true,
      id: statementPeriodId,
      status: nextStatus,
    }
  }

  const update =
    nextStatus === "closed"
      ? {
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: profile.id,
        }
      : {
          status: "open",
          closed_at: null,
          closed_by: null,
        }

  const { error: updateError } = await supabase
    .from("statement_periods")
    .update(update)
    .eq("id", statementPeriodId)

  if (updateError) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError.message,
    })
  }

  await logAdminActivity(
    supabase,
    profile.id,
    nextStatus === "closed" ? "statement_period.closed" : "statement_period.reopened",
    "statement_period",
    statementPeriodId,
    {
      artist_id: existingPeriod.artist_id,
      period_month: existingPeriod.period_month,
      previous_status: existingPeriod.status,
      next_status: nextStatus,
    },
  )

  return {
    ok: true,
    id: statementPeriodId,
    status: nextStatus,
  }
})
