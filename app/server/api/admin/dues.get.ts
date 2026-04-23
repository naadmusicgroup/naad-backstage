import { createError } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { toMoneyString } from "~~/server/utils/money"
import { mapAdminDueRecord, type DueRow } from "~~/server/utils/dues"
import type { AdminDueOption, AdminDuesResponse } from "~~/types/admin"

interface ArtistOptionRow {
  id: string
  name: string
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const [duesResult, artistsResult] = await Promise.all([
    supabase
      .from("dues")
      .select(
        "id, artist_id, title, amount, frequency, status, due_date, paid_at, cancelled_at, cancelled_by, ledger_entry_id, created_at, updated_at, artists(id, name), profiles(id, full_name, email)",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("artists")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ])

  throwIfError(duesResult.error, "Unable to load dues.")
  throwIfError(artistsResult.error, "Unable to load artist options.")

  const dues = ((duesResult.data ?? []) as DueRow[]).map(mapAdminDueRecord)
  const artistIds = new Set(dues.map((due) => due.artistId))
  const summary = dues.reduce(
    (accumulator, due) => {
      const amount = new Decimal(due.amount)

      if (due.status === "unpaid") {
        accumulator.unpaidCount += 1
        accumulator.unpaidAmount = accumulator.unpaidAmount.add(amount)
        accumulator.activeAmount = accumulator.activeAmount.add(amount)
      } else if (due.status === "paid") {
        accumulator.paidCount += 1
        accumulator.paidAmount = accumulator.paidAmount.add(amount)
        accumulator.activeAmount = accumulator.activeAmount.add(amount)
      } else {
        accumulator.cancelledCount += 1
        accumulator.cancelledAmount = accumulator.cancelledAmount.add(amount)
      }

      return accumulator
    },
    {
      unpaidCount: 0,
      paidCount: 0,
      cancelledCount: 0,
      activeAmount: new Decimal(0),
      unpaidAmount: new Decimal(0),
      paidAmount: new Decimal(0),
      cancelledAmount: new Decimal(0),
    },
  )

  return {
    dues,
    summary: {
      dueCount: dues.length,
      unpaidCount: summary.unpaidCount,
      paidCount: summary.paidCount,
      cancelledCount: summary.cancelledCount,
      activeAmount: toMoneyString(summary.activeAmount),
      unpaidAmount: toMoneyString(summary.unpaidAmount),
      paidAmount: toMoneyString(summary.paidAmount),
      cancelledAmount: toMoneyString(summary.cancelledAmount),
      artistCount: artistIds.size,
    },
    artistOptions: ((artistsResult.data ?? []) as ArtistOptionRow[]).map((row) => ({
      value: row.id,
      label: row.name,
    })) satisfies AdminDueOption[],
  } satisfies AdminDuesResponse
})
