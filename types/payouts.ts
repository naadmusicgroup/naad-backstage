import type { ArtistBankDetailsRecord } from "~~/types/settings"

export type PayoutRequestStatus = "pending" | "approved" | "rejected" | "paid"
export type PayoutPaymentMethod = "bank_transfer" | "esewa" | "khalti" | "other"
export const MIN_PAYOUT_AMOUNT = 50

export interface PayoutRequestRecord {
  id: string
  artistId: string
  artistName: string
  requestedBy: string | null
  amount: string
  serviceCharge?: string
  status: PayoutRequestStatus
  artistNotes: string | null
  adminNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  paidAt: string | null
  paymentMethod: PayoutPaymentMethod | null
  paymentReference: string | null
  createdAt: string
  updatedAt: string
  bankDetails: ArtistBankDetailsRecord | null
  isManualPayout?: boolean
  canReverse?: boolean
}

export interface ArtistPayoutArtistOption {
  artistId: string
  artistName: string
  availableBalance: string
  visibleBalance: string
  pendingPayouts: string
  approvedPayouts: string
  hasPendingRequest: boolean
}

export interface AdminPayoutArtistOption {
  value: string
  label: string
  availableBalance: string
  visibleBalance: string
  pendingPayouts: string
  approvedPayouts: string
  totalWithdrawn: string
}

export interface ArtistPayoutsResponse {
  artists: ArtistPayoutArtistOption[]
  requests: PayoutRequestRecord[]
  minimumAmount: string
  maxRequestsPerWindow: number
  requestWindowHours: number
}

export interface CreatePayoutRequestInput {
  artistId: string
  amount: string | number
  artistNotes: string | null
}

export interface PayoutMutationResponse {
  requestId: string
  status: PayoutRequestStatus
  amount?: string | null
  ledgerEntryId: string | null
  serviceCharge?: string | null
  serviceChargeDueId?: string | null
  serviceChargeLedgerEntryId?: string | null
  resultingBalance: string | null
}

export interface AdminPayoutSummary {
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  paidCount: number
  pendingAmount: string
  approvedAmount: string
  paidAmount: string
}

export interface AdminPayoutsResponse {
  requests: PayoutRequestRecord[]
  summary: AdminPayoutSummary
  artistOptions: AdminPayoutArtistOption[]
}

export interface ApprovePayoutRequestInput {
  adminNotes: string | null
}

export interface RejectPayoutRequestInput {
  adminNotes: string | null
}

export interface MarkPayoutPaidInput {
  adminNotes: string | null
  paymentMethod: PayoutPaymentMethod
  paymentReference: string | null
}

export interface UpdateAdminPayoutFinancialsInput {
  amount: string | number
  serviceCharge?: string | number | null
}

export interface CreateAdminManualPayoutInput {
  artistId: string
  amount: string | number
  serviceCharge?: string | number | null
  paidAt: string
  adminNotes: string | null
  paymentMethod: PayoutPaymentMethod
  paymentReference: string | null
}

export interface ReverseAdminManualPayoutInput {
  adminNotes: string | null
}

export interface ReverseAdminManualPayoutResponse {
  requestId: string
  artistId: string
  amount: string
  ledgerEntryId: string
  serviceCharge?: string | null
  serviceChargeDueId?: string | null
  serviceChargeLedgerEntryId?: string | null
  resultingBalance: string
}
