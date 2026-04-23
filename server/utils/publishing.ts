import { createError } from "h3"
import Decimal from "decimal.js"
import { toMoneyString } from "~~/server/utils/money"
import type { AdminPublishingRecord } from "~~/types/admin"

interface PublishingArtistJoinRow {
  id: string
  name: string
}

interface PublishingReleaseJoinRow {
  id: string
  title: string
}

interface PublishingRow {
  id: string
  artist_id: string
  release_id: string | null
  amount: string | number
  period_month: string
  notes: string | null
  entered_by: string
  ledger_entry_id: string | null
  created_at: string
  updated_at: string
  artists: PublishingArtistJoinRow | PublishingArtistJoinRow[] | null
  releases: PublishingReleaseJoinRow | PublishingReleaseJoinRow[] | null
}

const MONEY_PATTERN = /^\d+(\.\d{1,8})?$/

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

export function normalizePublishingAmount(value: unknown) {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: "Publishing amount is required.",
    })
  }

  if (!MONEY_PATTERN.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Publishing amount must be a valid money amount with up to 8 decimals.",
    })
  }

  const amount = new Decimal(normalized)

  if (amount.lte(0)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Publishing amount must be greater than zero.",
    })
  }

  return amount.toFixed(8)
}

export function statusCodeForPublishingRpcError(error: any) {
  const message = String(error?.message ?? "")

  if (
    message.includes("is required")
    || message.includes("must be greater than zero")
    || message.includes("must be a valid")
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
    || message.includes("does not belong")
  ) {
    return 404
  }

  if (message.includes("Period is closed")) {
    return 409
  }

  return 500
}

export function mapAdminPublishingRecord(
  row: PublishingRow,
  profileById: Map<string, string | null>,
): AdminPublishingRecord {
  const artist = unwrapJoinRow(row.artists)
  const release = unwrapJoinRow(row.releases)

  return {
    id: row.id,
    artistId: row.artist_id,
    artistName: artist?.name ?? "Unknown artist",
    releaseId: row.release_id,
    releaseTitle: release?.title ?? null,
    amount: toMoneyString(row.amount),
    periodMonth: row.period_month,
    notes: row.notes,
    enteredBy: row.entered_by,
    enteredByName: profileById.get(row.entered_by) ?? null,
    ledgerEntryId: row.ledger_entry_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
