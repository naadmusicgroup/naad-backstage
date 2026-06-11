import { createError } from "h3"
import Decimal from "decimal.js"
import type { SupabaseClient } from "@supabase/supabase-js"
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
  service_charge?: string | number | null
  bank_charge_pct?: string | number | null
  terms_accepted_at?: string | null
  terms_artist_share_pct?: string | number | null
  terms_fee_version?: string | null
  terms_fee_snapshot?: Record<string, unknown> | null
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

function toPercentString(value: string | number | null | undefined) {
  if (value === null || typeof value === "undefined") {
    return null
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : null
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

export function normalizeOptionalPayoutBankChargePct(value: unknown, label = "Bank charges") {
  const normalized = normalizeText(value)

  if (!normalized) {
    return "1.00"
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid percentage with up to 2 decimals.`,
    })
  }

  const amount = new Decimal(normalized)

  if (amount.lt(0)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} cannot be negative.`,
    })
  }

  if (amount.gt(100)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} cannot be more than 100%.`,
    })
  }

  return amount.toFixed(2)
}

export function resolvePayoutServiceChargeForRpc(
  serviceCharge: string | number | null | undefined,
) {
  const displayServiceCharge = toMoneyString(serviceCharge ?? 0)

  return {
    displayServiceCharge,
    rpcServiceCharge: "0.00000000",
  }
}

function isMissingServiceChargeColumn(error: { code?: string, message?: string } | null) {
  return error?.code === "42703" || String(error?.message ?? "").includes("service_charge")
}

export async function requirePayoutDisplayServiceChargeStorage(
  supabase: SupabaseClient<any>,
  serviceCharge: string | number | null | undefined,
) {
  const displayServiceCharge = toMoneyString(serviceCharge ?? 0)

  if (new Decimal(displayServiceCharge).lte(0)) {
    return
  }

  const { error } = await supabase
    .from("payout_requests")
    .select("id, service_charge")
    .limit(1)

  if (!error) {
    return
  }

  if (isMissingServiceChargeColumn(error)) {
    throw createError({
      statusCode: 503,
      statusMessage: "Tipalti service fee storage is not available. Apply the display-only payout fee migration first.",
    })
  }

  throw createError({
    statusCode: 500,
    statusMessage: "Unable to verify payout service fee storage before saving.",
  })
}

export async function updatePayoutDisplayServiceCharge(
  supabase: SupabaseClient<any>,
  requestId: string,
  serviceCharge: string | number | null | undefined,
) {
  const displayServiceCharge = toMoneyString(serviceCharge ?? 0)

  const { data, error } = await supabase
    .from("payout_requests")
    .update({ service_charge: displayServiceCharge })
    .eq("id", requestId)
    .select("id, service_charge")
    .maybeSingle()

  if (!error) {
    return toMoneyString(data?.service_charge ?? displayServiceCharge)
  }

  if (isMissingServiceChargeColumn(error) && new Decimal(displayServiceCharge).lte(0)) {
    return displayServiceCharge
  }

  if (isMissingServiceChargeColumn(error)) {
    throw createError({
      statusCode: 503,
      statusMessage: "Tipalti service fee storage is not available. Apply the display-only payout fee migration first.",
    })
  }

  throw createError({
    statusCode: 500,
    statusMessage: "Unable to save the payout service fee.",
  })
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
    serviceCharge: toMoneyString(row.service_charge ?? 0),
    bankChargePct: toPercentString(row.bank_charge_pct ?? 1) ?? "1.00",
    termsAcceptedAt: row.terms_accepted_at ?? null,
    termsArtistSharePct: toPercentString(row.terms_artist_share_pct),
    termsFeeVersion: row.terms_fee_version ?? null,
    termsFeeSnapshot: row.terms_fee_snapshot ?? null,
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
  artistSharePct?: string | number | null
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
    artistSharePct: toPercentString(row.artistSharePct),
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
    || message.includes("must be a valid")
    || message.includes("must be between")
    || message.includes("must be greater than zero")
    || message.includes("must be at least")
    || message.includes("cannot be negative")
    || message.includes("cannot be more than 100")
    || message.includes("No payout balance is available")
    || message.includes("deal percentage is not set")
    || message.includes("acknowledge your Naad Music Group deal")
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
