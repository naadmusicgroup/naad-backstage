import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { parse as parseCsv } from "csv-parse/sync"
import Decimal from "decimal.js"
import { createError } from "h3"
import type {
  CatalogAccessType,
  CsvPreviewIssueCode,
  CsvPreviewWarning,
  ImportSummary,
  ParsedMatchedRow,
  ParsedUnmatchedRow,
  ParsedUploadData,
  ReleasePreviewSummary,
  UnmatchedPreviewRow,
} from "~~/types/imports"

const CHUNK_SIZE = 500

interface RawCsvRow {
  sale_date?: string
  accounting_date?: string
  reporting_date?: string
  release_title?: string
  track_title?: string
  channel?: string
  country?: string
  isrc?: string
  upc?: string
  units?: string
  unit_price?: string
  original_currency?: string
  total?: string
}

interface PreparedCsvRow {
  csvRowNumber: number
  saleDate: string
  saleDateSource: "sale_date" | "accounting_date"
  accountingDate: string
  reportingDate: string | null
  releaseTitle: string | null
  trackTitle: string
  channelName: string
  territory: string
  territorySource: "country" | "default_np"
  isrc: string
  upc: string | null
  units: number
  unitPrice: string
  originalCurrency: string | null
  totalAmount: string
}

interface TrackRow {
  track_id: string
  release_id: string
  track_artist_id: string
  release_artist_id: string
  isrc: string
  normalized_isrc: string
  track_title: string
  track_status: string | null
  track_is_active: boolean | null
  release_title: string
  release_upc: string | null
  normalized_upc: string | null
  release_status: string | null
  release_is_active: boolean | null
  catalog_access: CatalogAccessType
  split_version_id: string | null
}

interface ChannelRow {
  id: string
  raw_name: string
}

interface ReleaseAccumulator {
  releaseId: string
  releaseTitle: string
  totalAmount: Decimal
  totalUnits: number
  rowCount: number
}

interface UnmatchedAccumulator {
  isrc: string
  trackTitle: string
  releaseTitle: string | null
  issueCode: CsvPreviewIssueCode
  reason: string | null
  totalAmount: Decimal
  units: number
  occurrences: number
  sampleChannels: Set<string>
}

export const CSV_UPLOAD_BUCKET = "csv-imports"
export const MAX_CSV_UPLOAD_BYTES = 5 * 1024 * 1024

function trimCell(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }

  return String(value).trim()
}

function hasCsvContent(row: RawCsvRow) {
  return Object.values(row).some((value) => trimCell(value).length > 0)
}

function normalizeIsoDate(value: unknown, label: string, rowNumber: number) {
  const trimmed = trimCell(value)

  if (!trimmed) {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV row ${rowNumber} is missing ${label}.`,
    })
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV row ${rowNumber} has an invalid ${label}: ${trimmed}.`,
    })
  }

  return trimmed
}

function optionalIsoDate(value: unknown, label: string, rowNumber: number) {
  const trimmed = trimCell(value)

  if (!trimmed) {
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV row ${rowNumber} has an invalid ${label}: ${trimmed}.`,
    })
  }

  return trimmed
}

function parseInteger(value: unknown, label: string, rowNumber: number) {
  const trimmed = trimCell(value).replaceAll(",", "")

  if (!trimmed) {
    return 0
  }

  if (!/^-?\d+$/.test(trimmed)) {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV row ${rowNumber} has an invalid ${label}: ${trimmed}.`,
    })
  }

  return Number(trimmed)
}

function parseMoney(value: unknown, label: string, rowNumber: number) {
  const trimmed = trimCell(value)

  if (!trimmed) {
    return "0.00000000"
  }

  const clean = trimmed.replace(/^\$/, "").replaceAll(",", "")

  try {
    return new Decimal(clean || "0").toFixed(8)
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV row ${rowNumber} has an invalid ${label}: ${trimmed}.`,
    })
  }
}

function minIsoDate(current: string | null, candidate: string | null) {
  if (!candidate) {
    return current
  }

  if (!current || candidate < current) {
    return candidate
  }

  return current
}

function maxIsoDate(current: string | null, candidate: string | null) {
  if (!candidate) {
    return current
  }

  if (!current || candidate > current) {
    return candidate
  }

  return current
}

function formatRowCountLabel(count: number) {
  return `${count} entr${count === 1 ? "y" : "ies"}`
}

function rowCountVerb(count: number) {
  return count === 1 ? "is" : "are"
}

function normalizeLookupKey(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase()
  return normalized || null
}

function archivedCatalogReason(track: TrackRow | null) {
  if (!track) {
    return null
  }

  if (
    track.track_status === "deleted"
    || track.track_is_active === false
    || track.release_status === "deleted"
    || track.release_is_active === false
  ) {
    return "ISRC exists in archived catalog. Restore catalog row before committing royalties."
  }

  return null
}

function activeCandidate(track: TrackRow) {
  return !archivedCatalogReason(track)
}

function buildPreviewWarnings(preparedRows: PreparedCsvRow[]) {
  const warnings: CsvPreviewWarning[] = []
  const saleDateFallbackRows = preparedRows.filter((row) => row.saleDateSource !== "sale_date")

  if (saleDateFallbackRows.length) {
    const totalAmount = saleDateFallbackRows.reduce(
      (sum, row) => sum.add(row.totalAmount),
      new Decimal(0),
    )
    const rowLabel = formatRowCountLabel(saleDateFallbackRows.length)
    const hasRevenue = !totalAmount.isZero()

    warnings.push({
      code: "sale_date_fallback",
      severity: hasRevenue ? "warning" : "info",
      message: hasRevenue
        ? `${rowLabel} ${rowCountVerb(saleDateFallbackRows.length)} missing sale_date, so the preview used accounting_date instead. Revenue is still captured, but sale-period reporting is less precise for those entries.`
        : `${rowLabel} ${rowCountVerb(saleDateFallbackRows.length)} missing sale_date, so the preview used accounting_date instead. Those entries carry no revenue, so financial totals are unchanged.`,
      rowCount: saleDateFallbackRows.length,
      totalAmount: totalAmount.toFixed(8),
      sampleRows: saleDateFallbackRows.slice(0, 5).map((row) => row.csvRowNumber),
    })
  }

  const missingCountryRows = preparedRows.filter((row) => row.territorySource === "default_np")

  if (missingCountryRows.length) {
    const totalAmount = missingCountryRows.reduce((sum, row) => sum.add(row.totalAmount), new Decimal(0))
    const rowLabel = formatRowCountLabel(missingCountryRows.length)

    warnings.push({
      code: "missing_country",
      severity: totalAmount.isZero() ? "info" : "warning",
      message: `${rowLabel} ${rowCountVerb(missingCountryRows.length)} missing country in the CSV, so the preview defaulted them to NP. Revenue can still commit, but those entries now count under Nepal in territory reporting.`,
      rowCount: missingCountryRows.length,
      totalAmount: totalAmount.toFixed(8),
      sampleRows: missingCountryRows.slice(0, 5).map((row) => row.csvRowNumber),
    })
  }

  return warnings
}

function chunkItems<T>(items: T[], size = CHUNK_SIZE) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function prepareCsvRow(row: RawCsvRow, csvRowNumber: number): PreparedCsvRow {
  const channelName = trimCell(row.channel)

  if (!channelName) {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV row ${csvRowNumber} is missing channel.`,
    })
  }

  const trackTitle = trimCell(row.track_title)

  if (!trackTitle) {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV row ${csvRowNumber} is missing track_title.`,
    })
  }

  const accountingDate = normalizeIsoDate(row.accounting_date, "accounting_date", csvRowNumber)
  const saleDate = optionalIsoDate(row.sale_date, "sale_date", csvRowNumber)
  const reportingDate = optionalIsoDate(row.reporting_date, "reporting_date", csvRowNumber)
  const territory = trimCell(row.country)

  return {
    csvRowNumber,
    saleDate: saleDate ?? accountingDate,
    saleDateSource: saleDate ? "sale_date" : "accounting_date",
    accountingDate,
    reportingDate,
    releaseTitle: trimCell(row.release_title) || null,
    trackTitle,
    channelName,
    territory: territory || "NP",
    territorySource: territory ? "country" : "default_np",
    isrc: trimCell(row.isrc).toUpperCase(),
    upc: trimCell(row.upc) || null,
    units: parseInteger(row.units, "units", csvRowNumber),
    unitPrice: parseMoney(row.unit_price, "unit_price", csvRowNumber),
    originalCurrency: trimCell(row.original_currency) || null,
    totalAmount: parseMoney(row.total, "total", csvRowNumber),
  }
}

async function fetchIngestableTrackCandidates(
  supabase: SupabaseClient<any>,
  artistId: string,
  isrcs: string[],
  periodMonth: string,
) {
  const trackMap = new Map<string, TrackRow[]>()

  for (const chunk of chunkItems(isrcs)) {
    const { data, error } = await supabase.rpc("get_artist_ingestable_track_candidates", {
      target_artist_id: artistId,
      target_isrcs: chunk,
      target_period_month: periodMonth,
    })

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    for (const track of (data ?? []) as TrackRow[]) {
      const normalizedIsrc = normalizeLookupKey(track.normalized_isrc || track.isrc)

      if (!normalizedIsrc) {
        continue
      }

      const existing = trackMap.get(normalizedIsrc) ?? []
      existing.push(track)
      trackMap.set(normalizedIsrc, existing)
    }
  }

  return trackMap
}

async function fetchChannelsByName(supabase: SupabaseClient<any>, channelNames: string[]) {
  const existingMap = new Map<string, ChannelRow>()

  for (const chunk of chunkItems(channelNames)) {
    const { data, error } = await supabase.from("channels").select("id, raw_name").in("raw_name", chunk)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    for (const channel of (data ?? []) as ChannelRow[]) {
      existingMap.set(channel.raw_name, channel)
    }
  }

  const missingChannels = channelNames.filter((channelName) => !existingMap.has(channelName))

  if (missingChannels.length) {
    const { error } = await supabase.from("channels").upsert(
      missingChannels.map((rawName) => ({
        raw_name: rawName,
        display_name: rawName,
      })),
      {
        onConflict: "raw_name",
      },
    )

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    return fetchChannelsByName(supabase, channelNames)
  }

  return existingMap
}

interface CandidateResolution {
  track: TrackRow | null
  issueCode: CsvPreviewIssueCode | null
  reason: string | null
  releaseTitle: string | null
}

function resolveTrackCandidate(row: PreparedCsvRow, candidates: TrackRow[]): CandidateResolution {
  if (!normalizeLookupKey(row.isrc)) {
    return {
      track: null,
      issueCode: "missing_isrc",
      reason: "CSV row is missing ISRC. Add the track ISRC before committing royalties.",
      releaseTitle: row.releaseTitle,
    }
  }

  if (!candidates.length) {
    return {
      track: null,
      issueCode: "catalog_not_found",
      reason: null,
      releaseTitle: row.releaseTitle,
    }
  }

  const rowUpc = normalizeLookupKey(row.upc)
  let scopedCandidates = candidates

  if (rowUpc) {
    const upcMatches = candidates.filter((candidate) => candidate.normalized_upc === rowUpc)

    if (upcMatches.length) {
      scopedCandidates = upcMatches
    } else if (candidates.some(activeCandidate)) {
      return {
        track: null,
        issueCode: "upc_mismatch",
        reason: "CSV UPC does not match any accessible active release for this ISRC.",
        releaseTitle: candidates[0]?.release_title ?? row.releaseTitle,
      }
    }
  }

  const activeCandidates = scopedCandidates.filter(activeCandidate)

  if (activeCandidates.length === 1) {
    return {
      track: activeCandidates[0],
      issueCode: null,
      reason: null,
      releaseTitle: activeCandidates[0].release_title,
    }
  }

  if (activeCandidates.length > 1) {
    return {
      track: null,
      issueCode: "ambiguous_catalog_isrc",
      reason: "Multiple accessible active catalog tracks share this ISRC. Add UPC to the CSV or resolve the duplicate catalog records.",
      releaseTitle: activeCandidates[0]?.release_title ?? row.releaseTitle,
    }
  }

  return {
    track: null,
    issueCode: "archived_catalog_isrc",
    reason: archivedCatalogReason(scopedCandidates[0] ?? candidates[0]) ?? "ISRC exists in archived catalog. Restore catalog row before committing royalties.",
    releaseTitle: scopedCandidates[0]?.release_title ?? candidates[0]?.release_title ?? row.releaseTitle,
  }
}

export function normalizePeriodMonth(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)

  if (!match) {
    return null
  }

  const month = Number(match[2])

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null
  }

  return `${match[1]}-${match[2]}-01`
}

export function buildUploadStoragePath(artistId: string, uploadId: string) {
  return `csv/${artistId}/${uploadId}.csv`
}

export async function ensureCsvUploadBucket(supabase: SupabaseClient<any>) {
  const { data, error } = await supabase.storage.getBucket(CSV_UPLOAD_BUCKET)

  if (data && !error) {
    return
  }

  const isMissingBucket = /not found/i.test(error?.message ?? "")

  if (!isMissingBucket && error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  const { error: createBucketError } = await supabase.storage.createBucket(CSV_UPLOAD_BUCKET, {
    public: false,
    fileSizeLimit: MAX_CSV_UPLOAD_BYTES,
    allowedMimeTypes: ["text/csv", "text/plain", "application/vnd.ms-excel"],
  })

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    throw createError({
      statusCode: 500,
      statusMessage: createBucketError.message,
    })
  }
}

export async function markCsvUploadFailed(
  supabase: SupabaseClient<any>,
  uploadId: string,
  message: string,
) {
  const { error } = await supabase
    .from("csv_uploads")
    .update({
      status: "failed",
      error_message: message,
      parsed_data: null,
    })
    .eq("id", uploadId)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }
}

export function computeCsvChecksum(csvText: string) {
  return createHash("sha256").update(csvText).digest("hex")
}

export async function buildCsvPreview(
  supabase: SupabaseClient<any>,
  csvText: string,
  artistId: string,
  periodMonth: string,
) {
  const checksum = computeCsvChecksum(csvText)
  let parsedRows: RawCsvRow[]

  try {
    parsedRows = parseCsv(csvText, {
      columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as RawCsvRow[]
  } catch (error: any) {
    throw createError({
      statusCode: 400,
      statusMessage: `CSV parse failed. ${error?.message || "Invalid CSV format."}`,
    })
  }

  const csvRows: RawCsvRow[] = parsedRows.filter((row: RawCsvRow) => hasCsvContent(row))

  if (!csvRows.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "CSV is empty. Upload at least one data row.",
    })
  }

  const preparedRows: PreparedCsvRow[] = csvRows.map((row: RawCsvRow, index: number) =>
    prepareCsvRow(row, index + 2),
  )
  const isrcs = [
    ...new Set(preparedRows.map((row) => row.isrc).filter((isrc): isrc is string => Boolean(isrc))),
  ]
  const channelNames: string[] = [...new Set(preparedRows.map((row) => row.channelName))]
  const trackMap = await fetchIngestableTrackCandidates(supabase, artistId, isrcs, periodMonth)
  const channelMap = await fetchChannelsByName(supabase, channelNames)

  const matchedRows: ParsedMatchedRow[] = []
  const unmatchedRows: ParsedUnmatchedRow[] = []
  const releaseAccumulators = new Map<string, ReleaseAccumulator>()
  const unmatchedAccumulators = new Map<string, UnmatchedAccumulator>()
  let totalAmount = new Decimal(0)
  let totalUnits = 0
  let periodStart: string | null = null
  let periodEnd: string | null = null
  let reportingDate: string | null = null
  const countries = new Set<string>()

  for (const row of preparedRows) {
    totalAmount = totalAmount.add(row.totalAmount)
    totalUnits += row.units
    periodStart = minIsoDate(periodStart, row.accountingDate)
    periodEnd = maxIsoDate(periodEnd, row.saleDate)
    reportingDate = maxIsoDate(reportingDate, row.reportingDate)

    if (row.territory) {
      countries.add(row.territory)
    }

    const channel = channelMap.get(row.channelName)

    if (!channel) {
      throw createError({
        statusCode: 500,
        statusMessage: `Channel lookup failed for ${row.channelName}.`,
      })
    }

    const normalizedIsrc = normalizeLookupKey(row.isrc)
    const resolution = resolveTrackCandidate(row, normalizedIsrc ? trackMap.get(normalizedIsrc) ?? [] : [])
    const track = resolution.track

    if (!track) {
      const unmatchedKey = row.isrc || `missing:${row.csvRowNumber}`
      const issueCode = resolution.issueCode ?? "catalog_not_found"
      const unmatchedRow: ParsedUnmatchedRow = {
        csvRowNumber: row.csvRowNumber,
        saleDate: row.saleDate,
        accountingDate: row.accountingDate,
        reportingDate: row.reportingDate,
        territory: row.territory,
        units: row.units,
        unitPrice: row.unitPrice,
        originalCurrency: row.originalCurrency,
        totalAmount: row.totalAmount,
        channelName: row.channelName,
        isrc: row.isrc || "(missing ISRC)",
        trackTitle: row.trackTitle,
        releaseTitle: resolution.releaseTitle ?? row.releaseTitle,
        issueCode,
        reason: resolution.reason,
        upc: row.upc,
      }

      unmatchedRows.push(unmatchedRow)

      const existingUnmatched = unmatchedAccumulators.get(unmatchedKey)

      if (existingUnmatched) {
        existingUnmatched.totalAmount = existingUnmatched.totalAmount.add(row.totalAmount)
        existingUnmatched.units += row.units
        existingUnmatched.occurrences += 1
        existingUnmatched.sampleChannels.add(row.channelName)
      } else {
        unmatchedAccumulators.set(unmatchedKey, {
          isrc: unmatchedRow.isrc,
          trackTitle: row.trackTitle,
          releaseTitle: unmatchedRow.releaseTitle,
          issueCode,
          reason: resolution.reason,
          totalAmount: new Decimal(row.totalAmount),
          units: row.units,
          occurrences: 1,
          sampleChannels: new Set([row.channelName]),
        })
      }

      continue
    }

    const releaseTitle = track.release_title ?? row.releaseTitle ?? "Unknown release"
    const matchedRow: ParsedMatchedRow = {
      csvRowNumber: row.csvRowNumber,
      saleDate: row.saleDate,
      accountingDate: row.accountingDate,
      reportingDate: row.reportingDate,
      territory: row.territory,
      units: row.units,
      unitPrice: row.unitPrice,
      originalCurrency: row.originalCurrency,
      totalAmount: row.totalAmount,
      channelId: channel.id,
      channelName: row.channelName,
      trackId: track.track_id,
      trackTitle: track.track_title || row.trackTitle,
      releaseId: track.release_id,
      releaseTitle,
      isrc: row.isrc,
      upc: row.upc,
      catalogAccess: track.catalog_access,
      splitVersionId: track.split_version_id,
    }

    matchedRows.push(matchedRow)

    const existingRelease = releaseAccumulators.get(matchedRow.releaseId)

    if (existingRelease) {
      existingRelease.totalAmount = existingRelease.totalAmount.add(row.totalAmount)
      existingRelease.totalUnits += row.units
      existingRelease.rowCount += 1
    } else {
      releaseAccumulators.set(matchedRow.releaseId, {
        releaseId: matchedRow.releaseId,
        releaseTitle,
        totalAmount: new Decimal(row.totalAmount),
        totalUnits: row.units,
        rowCount: 1,
      })
    }
  }

  const releases: ReleasePreviewSummary[] = [...releaseAccumulators.values()]
    .sort((left, right) => right.totalAmount.comparedTo(left.totalAmount))
    .map((release) => ({
      releaseId: release.releaseId,
      releaseTitle: release.releaseTitle,
      totalAmount: release.totalAmount.toFixed(8),
      totalUnits: release.totalUnits,
      rowCount: release.rowCount,
    }))

  const unmatched: UnmatchedPreviewRow[] = [...unmatchedAccumulators.values()]
    .sort((left, right) => {
      if (right.occurrences !== left.occurrences) {
        return right.occurrences - left.occurrences
      }

      return right.totalAmount.comparedTo(left.totalAmount)
    })
    .map((entry) => ({
      isrc: entry.isrc,
      trackTitle: entry.trackTitle,
      releaseTitle: entry.releaseTitle,
      issueCode: entry.issueCode,
      reason: entry.reason,
      totalAmount: entry.totalAmount.toFixed(8),
      units: entry.units,
      occurrences: entry.occurrences,
      sampleChannels: [...entry.sampleChannels].sort(),
    }))

  const summary: ImportSummary = {
    rowCount: preparedRows.length,
    matchedCount: matchedRows.length,
    unmatchedCount: unmatchedRows.length,
    totalAmount: totalAmount.toFixed(8),
    totalUnits,
    channelCount: channelMap.size,
    countryCount: countries.size,
    periodStart,
    periodEnd,
    reportingDate,
  }
  const warnings = buildPreviewWarnings(preparedRows)

  const parsedData: ParsedUploadData = {
    version: 1,
    generatedAt: new Date().toISOString(),
    summary,
    releases,
    unmatched,
    warnings,
    matchedRows,
    unmatchedRows,
  }

  return {
    checksum,
    parsedData,
  }
}
