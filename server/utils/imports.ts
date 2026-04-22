import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { parse as parseCsv } from "csv-parse/sync"
import Decimal from "decimal.js"
import { createError } from "h3"
import type {
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
  territory: string | null
  isrc: string
  upc: string | null
  units: number
  unitPrice: string
  originalCurrency: string | null
  totalAmount: string
}

interface TrackRow {
  id: string
  title: string
  isrc: string
  release_id: string
}

interface ReleaseRow {
  id: string
  title: string
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
  return `${count} row${count === 1 ? "" : "s"}`
}

function rowCountVerb(count: number) {
  return count === 1 ? "is" : "are"
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
        ? `${rowLabel} ${rowCountVerb(saleDateFallbackRows.length)} missing sale_date, so the preview used accounting_date instead. Revenue is still captured, but sale-period reporting is less precise for those rows.`
        : `${rowLabel} ${rowCountVerb(saleDateFallbackRows.length)} missing sale_date, so the preview used accounting_date instead. Those rows carry no revenue, so financial totals are unchanged.`,
      rowCount: saleDateFallbackRows.length,
      totalAmount: totalAmount.toFixed(8),
      sampleRows: saleDateFallbackRows.slice(0, 5).map((row) => row.csvRowNumber),
    })
  }

  const missingCountryRows = preparedRows.filter((row) => !row.territory)

  if (missingCountryRows.length) {
    const totalAmount = missingCountryRows.reduce((sum, row) => sum.add(row.totalAmount), new Decimal(0))
    const rowLabel = formatRowCountLabel(missingCountryRows.length)

    warnings.push({
      code: "missing_country",
      severity: totalAmount.isZero() ? "info" : "warning",
      message: `${rowLabel} ${rowCountVerb(missingCountryRows.length)} missing country. Revenue can still commit, but territory analytics and country rollups will be incomplete for those rows.`,
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

  return {
    csvRowNumber,
    saleDate: saleDate ?? accountingDate,
    saleDateSource: saleDate ? "sale_date" : "accounting_date",
    accountingDate,
    reportingDate,
    releaseTitle: trimCell(row.release_title) || null,
    trackTitle,
    channelName,
    territory: trimCell(row.country) || null,
    isrc: trimCell(row.isrc).toUpperCase(),
    upc: trimCell(row.upc) || null,
    units: parseInteger(row.units, "units", csvRowNumber),
    unitPrice: parseMoney(row.unit_price, "unit_price", csvRowNumber),
    originalCurrency: trimCell(row.original_currency) || null,
    totalAmount: parseMoney(row.total, "total", csvRowNumber),
  }
}

async function fetchTracksByIsrc(supabase: SupabaseClient<any>, isrcs: string[]) {
  const trackMap = new Map<string, TrackRow>()

  for (const chunk of chunkItems(isrcs)) {
    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, isrc, release_id")
      .in("isrc", chunk)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    for (const track of (data ?? []) as TrackRow[]) {
      trackMap.set(track.isrc, track)
    }
  }

  return trackMap
}

async function fetchReleasesById(supabase: SupabaseClient<any>, releaseIds: string[]) {
  const releaseMap = new Map<string, ReleaseRow>()

  for (const chunk of chunkItems(releaseIds)) {
    const { data, error } = await supabase.from("releases").select("id, title").in("id", chunk)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    for (const release of (data ?? []) as ReleaseRow[]) {
      releaseMap.set(release.id, release)
    }
  }

  return releaseMap
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

export async function buildCsvPreview(supabase: SupabaseClient<any>, csvText: string) {
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
  const trackMap = await fetchTracksByIsrc(supabase, isrcs)
  const releaseIds = [...new Set([...trackMap.values()].map((track) => track.release_id))]
  const releaseMap = await fetchReleasesById(supabase, releaseIds)
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

    const track = row.isrc ? trackMap.get(row.isrc) : null

    if (!track) {
      const unmatchedKey = row.isrc || `missing:${row.csvRowNumber}`
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
        releaseTitle: row.releaseTitle,
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
          releaseTitle: row.releaseTitle,
          totalAmount: new Decimal(row.totalAmount),
          units: row.units,
          occurrences: 1,
          sampleChannels: new Set([row.channelName]),
        })
      }

      continue
    }

    const release = releaseMap.get(track.release_id)
    const releaseTitle = release?.title ?? row.releaseTitle ?? "Unknown release"
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
      trackId: track.id,
      trackTitle: track.title || row.trackTitle,
      releaseId: track.release_id,
      releaseTitle,
      isrc: row.isrc,
      upc: row.upc,
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
