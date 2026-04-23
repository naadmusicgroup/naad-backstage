import { createError } from "h3"
import Decimal from "decimal.js"
import { toMoneyString } from "~~/server/utils/money"
import type { AdminDueRecord, AdminDueStatus } from "~~/types/admin"

interface DueArtistJoinRow {
  id: string
  name: string
}

interface DueProfileJoinRow {
  id: string
  full_name: string | null
  email: string | null
}

export interface DueRow {
  id: string
  artist_id: string
  title: string
  amount: string | number
  frequency: "one_time"
  status: AdminDueStatus
  due_date: string | null
  paid_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  ledger_entry_id: string | null
  created_at: string
  updated_at: string
  artists: DueArtistJoinRow | DueArtistJoinRow[] | null
  profiles: DueProfileJoinRow | DueProfileJoinRow[] | null
}

const MONEY_PATTERN = /^\d+(\.\d{1,8})?$/

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

export function normalizeDueAmount(value: unknown) {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: "Due amount is required.",
    })
  }

  if (!MONEY_PATTERN.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Due amount must be a valid money amount with up to 8 decimals.",
    })
  }

  const amount = new Decimal(normalized)

  if (amount.lte(0)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Due amount must be greater than zero.",
    })
  }

  return amount.toFixed(8)
}

export function statusCodeForDuesRpcError(error: any) {
  const message = String(error?.message ?? "")

  if (
    message.includes("is required")
    || message.includes("must be")
    || message.includes("cannot be edited")
    || message.includes("Only unpaid dues")
    || message.includes("already been cancelled")
  ) {
    return 400
  }

  if (
    message.includes("Only admins can manage")
    || message.includes("Admin id is required")
  ) {
    return 403
  }

  if (
    message.includes("does not exist")
    || message.includes("could not be found")
  ) {
    return 404
  }

  return 500
}

export function mapAdminDueRecord(row: DueRow): AdminDueRecord {
  const artist = unwrapJoinRow(row.artists)
  const cancelledBy = unwrapJoinRow(row.profiles)

  return {
    id: row.id,
    artistId: row.artist_id,
    artistName: artist?.name ?? "Unknown artist",
    title: row.title,
    amount: toMoneyString(row.amount),
    frequency: row.frequency,
    status: row.status,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancelledByName: cancelledBy?.full_name?.trim() || cancelledBy?.email?.trim() || null,
    ledgerEntryId: row.ledger_entry_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
