export interface ImportArtistOption {
  id: string
  name: string
  email: string | null
}

export interface CsvUploadTargetResponse {
  uploadId: string
  bucket: string
  path: string
  token: string
  filename: string
  artistId: string
  periodMonth: string
}

export type CsvUploadStatus = "processing" | "completed" | "failed" | "reversed" | "abandoned"

export interface ManualAnalyticsInput {
  spotifyMonthlyListeners: number | null
  appleMusicPlays: number | null
  tikTokVideoCreations: number | null
  metaImpressions: number | null
  youtubeViews: number | null
}

export interface ImportSummary {
  rowCount: number
  matchedCount: number
  unmatchedCount: number
  totalAmount: string
  totalUnits: number
  channelCount: number
  countryCount: number
  periodStart: string | null
  periodEnd: string | null
  reportingDate: string | null
}

export interface CsvPreviewWarning {
  code: "sale_date_fallback" | "missing_country"
  severity: "info" | "warning"
  message: string
  rowCount: number
  totalAmount: string
  sampleRows: number[]
}

export interface ReleasePreviewSummary {
  releaseId: string
  releaseTitle: string
  totalAmount: string
  totalUnits: number
  rowCount: number
}

export interface UnmatchedPreviewRow {
  isrc: string
  trackTitle: string
  releaseTitle: string | null
  totalAmount: string
  units: number
  occurrences: number
  sampleChannels: string[]
}

export interface ParsedMatchedRow {
  csvRowNumber: number
  saleDate: string
  accountingDate: string
  reportingDate: string | null
  territory: string | null
  units: number
  unitPrice: string
  originalCurrency: string | null
  totalAmount: string
  channelId: string
  channelName: string
  trackId: string
  trackTitle: string
  releaseId: string
  releaseTitle: string
  isrc: string
  upc: string | null
}

export interface ParsedUnmatchedRow {
  csvRowNumber: number
  saleDate: string
  accountingDate: string
  reportingDate: string | null
  territory: string | null
  units: number
  unitPrice: string
  originalCurrency: string | null
  totalAmount: string
  channelName: string
  isrc: string
  trackTitle: string
  releaseTitle: string | null
  upc: string | null
}

export interface ParsedUploadData {
  version: 1
  generatedAt: string
  summary: ImportSummary
  releases: ReleasePreviewSummary[]
  unmatched: UnmatchedPreviewRow[]
  warnings: CsvPreviewWarning[]
  matchedRows: ParsedMatchedRow[]
  unmatchedRows: ParsedUnmatchedRow[]
}

export interface CsvPreviewResponse {
  uploadId: string
  filename: string
  checksum: string
  summary: ImportSummary
  releases: ReleasePreviewSummary[]
  unmatched: UnmatchedPreviewRow[]
  warnings: CsvPreviewWarning[]
}

export interface CsvCommitResponse {
  uploadId: string
  status: "completed"
  rowsInserted: number
  totalAmount: string
  analyticsRows: number
  ledgerEntryId: string
}

export interface CsvReverseResponse {
  uploadId: string
  status: "reversed"
  rowsInserted: number
  totalAmount: string
  ledgerEntryId: string
  currentBalance: string
  resultingBalance: string
}

export interface CsvUploadHistoryItem {
  id: string
  artistId: string
  filename: string
  status: CsvUploadStatus
  rowCount: number | null
  matchedCount: number | null
  unmatchedCount: number | null
  totalAmount: string | null
  periodMonth: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}
