import { createError } from "h3"
import Decimal from "decimal.js"
import {
  MIN_PAYOUT_AMOUNT,
  type ArtistPayoutArtistOption,
  type PayoutPaymentMethod,
  type PayoutRequestRecord,
  type PayoutRequestStatus,
} from "~~/types/payouts"
import type { ArtistBankDetailsRecord } from "~~/types/settings"
import { toMoneyString } from "~~/server/utils/money"

interface ArtistJoinRow {
  id: string
  name: string
  artist_bank_details?: ArtistBankDetailsJoinRow[] | null
}

interface ArtistBankDetailsJoinRow {
  account_name: string
  bank_name: string
  account_number: string
  bank_address: string | null
  updated_at: string | null
}

interface PayoutRequestRow {
  id: string
  artist_id: string
  requested_by: string | null
  amount: string | number
  status: PayoutRequestStatus
  artist_notes: string | null
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  paid_at: string | null
  payment_method: PayoutPaymentMethod | null
  payment_reference: string | null
  created_at: string
  updated_at: string
  artists: ArtistJoinRow | ArtistJoinRow[] | null
}

const PAYMENT_METHODS = new Set<PayoutPaymentMethod>(["bank_transfer", "esewa", "khalti", "other"])

export const MAX_PAYOUT_REQUESTS_PER_WINDOW = 3
export const PAYOUT_REQUEST_WINDOW_HOURS = 24
export { MIN_PAYOUT_AMOUNT }

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function unwrapJoinRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value
}

export function normalizeOptionalPayoutNotes(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

export function normalizeRequiredPayoutAmount(value: unknown, label = "Amount") {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is required.`,
    })
  }

  if (!/^\d+(\.\d{1,8})?$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid money amount with up to 8 decimals.`,
    })
  }

  const amount = new Decimal(normalized)

  if (amount.lte(0)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be greater than zero.`,
    })
  }

  if (amount.lt(MIN_PAYOUT_AMOUNT)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be at least $${MIN_PAYOUT_AMOUNT.toFixed(2)}.`,
    })
  }

  return amount.toFixed(8)
}

export function normalizeRequiredManualPayoutAmount(value: unknown, label = "Amount") {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is required.`,
    })
  }

  if (!/^\d+(\.\d{1,8})?$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid money amount with up to 8 decimals.`,
    })
  }

  const amount = new Decimal(normalized)

  if (amount.lte(0)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be greater than zero.`,
    })
  }

  return amount.toFixed(8)
}

export function normalizeOptionalManualPayoutServiceCharge(value: unknown, label = "Service charge") {
  const normalized = normalizeText(value)

  if (!normalized) {
    return "0.00000000"
  }

  if (!/^\d+(\.\d{1,8})?$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid money amount with up to 8 decimals.`,
    })
  }

  const amount = new Decimal(normalized)

  if (amount.lt(0)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} cannot be negative.`,
    })
  }

  return amount.toFixed(8)
}

export function normalizeRequiredPayoutPaidAt(value: unknown) {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: "Payout date and time is required.",
    })
  }

  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: "Payout date and time is invalid.",
    })
  }

  if (date.getTime() > Date.now() + 5 * 60 * 1000) {
    throw createError({
      statusCode: 400,
      statusMessage: "Payout date and time cannot be in the future.",
    })
  }

  return date.toISOString()
}

export function normalizeRequiredPaymentMethod(value: unknown) {
  const normalized = normalizeText(value) as PayoutPaymentMethod

  if (!PAYMENT_METHODS.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Payment method must be bank_transfer, esewa, khalti, or other.",
    })
  }

  return normalized
}

export function mapPayoutRequestRecord(row: PayoutRequestRow): PayoutRequestRecord {
  const artist = unwrapJoinRow(row.artists)
  const bankDetails = unwrapJoinRow(artist?.artist_bank_details ?? null)

    return {
      id: row.id,
      artistId: row.artist_id,
      artistName: artist?.name ?? "Unknown artist",
      requestedBy: row.requested_by,
    amount: toMoneyString(row.amount),
    status: row.status,
    artistNotes: row.artist_notes,
    adminNotes: row.admin_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    paidAt: row.paid_at,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankDetails: bankDetails
      ? ({
          accountName: bankDetails.account_name,
          bankName: bankDetails.bank_name,
          accountNumber: bankDetails.account_number,
          bankAddress: bankDetails.bank_address,
          updatedAt: bankDetails.updated_at,
        } satisfies ArtistBankDetailsRecord)
      : null,
  }
}

export function mapArtistPayoutOption(row: {
  artistId: string
  artistName: string
  availableBalance: string | number | null
  pendingPayouts: string | number | null
  approvedPayouts: string | number | null
  hasPendingRequest: boolean
}): ArtistPayoutArtistOption {
  const availableBalance = new Decimal(row.availableBalance ?? 0)
  const visibleBalance = Decimal.max(availableBalance, 0)

  return {
    artistId: row.artistId,
    artistName: row.artistName,
    availableBalance: toMoneyString(availableBalance),
    visibleBalance: toMoneyString(visibleBalance),
    pendingPayouts: toMoneyString(row.pendingPayouts),
    approvedPayouts: toMoneyString(row.approvedPayouts),
    hasPendingRequest: row.hasPendingRequest,
  }
}

export function statusCodeForPayoutRpcError(error: any) {
  const message = String(error?.message ?? "")

  if (
    message.includes("already exists")
    || message.includes("at most 3 payout requests")
    || message.includes("exceeds the available balance")
    || message.includes("Only pending payout requests can be approved.")
    || message.includes("Only approved payout requests can be marked as paid.")
    || message.includes("Only pending or approved payout requests can be rejected.")
    || message.includes("Only admin-recorded manual payouts can be reversed.")
    || message.includes("Only paid manual payouts can be reversed.")
    || message.includes("cannot carry a service charge")
    || message.includes("ledger could not be found")
  ) {
    return 409
  }

  if (
    message.includes("cannot request a payout")
    || message.includes("Admin id is required.")
    || message.includes("Requester id is required.")
    || message.includes("Only admins can")
  ) {
    return 403
  }

  if (
    message.includes("is required")
    || message.includes("must be greater than zero")
    || message.includes("must be at least")
    || message.includes("cannot be negative")
    || message.includes("No payout balance is available")
    || message.includes("date and time")
  ) {
    return 400
  }

  if (
    message.includes("could not be found")
    || message.includes("does not exist")
  ) {
    return 404
  }

  return 500
}
