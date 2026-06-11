import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { readEnv } from "./env"

type EnvMap = Record<string, string>

interface ArtistSeedInput {
  email: string
  password: string
  fullName: string
  stageName: string
  country: string
  bio: string
}

interface SharedArtistInput {
  userId: string
  stageName: string
  email: string
  country: string
  bio: string
}

interface CsvUploadSeedInput {
  uploadedBy: string
  artistId: string
  filename: string
  checksum: string
  periodMonth: string
}

interface PayoutRequestSeedInput {
  requestedBy: string
  artistId: string
  amount: string
  status?: "pending" | "approved" | "rejected" | "paid"
}

interface CatalogTrackSeedInput {
  artistId: string
  releaseTitle: string
  trackTitle: string
  isrc: string
  upc?: string | null
  creditedName?: string | null
}

interface RoyaltyPreviewUploadSeedInput {
  uploadedBy: string
  artistId: string
  filename: string
  csvText: string
  periodMonth: string
  checksum: string
}

interface EarningSeedInput {
  uploadedBy: string
  artistId: string
  releaseId: string
  trackId: string
  amount: string
  units?: number
  checksum: string
  filename: string
  periodMonth: string
}

interface PublishingWriterSeedInput {
  fullName: string
  ipiNumber?: string | null
  proName?: string | null
}

interface ArtistPublishingInfoSeedInput {
  artistId: string
  legalName: string
  ipiNumber?: string | null
  proName?: string | null
}

interface AdminPurgeArtistResult {
  artist_id: string
  linked_user_id: string | null
  profile_became_unused: boolean
  remaining_linked_artist_count: number
}

interface AdminAnalyticsRevenueRpcRow {
  artist_id: string | null
  artist_name: string | null
  revenue: string | number | null
}

const CSV_UPLOAD_BUCKET = "csv-imports"

function parseEnvFile(content: string): EnvMap {
  const values: EnvMap = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith("#")) {
      continue
    }

    const separatorIndex = line.indexOf("=")

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env")

  if (!fs.existsSync(envPath)) {
    return {}
  }

  return parseEnvFile(fs.readFileSync(envPath, "utf8"))
}

const localEnv = loadLocalEnv()
const supabaseUrl = readEnv("NUXT_PUBLIC_SUPABASE_URL") || localEnv.NUXT_PUBLIC_SUPABASE_URL
const supabaseSecretKey = readEnv("SUPABASE_SECRET_KEY") || localEnv.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Smoke Supabase helpers require NUXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.")
}

const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

export async function findAuthUserByEmail(email: string) {
  const normalizedEmail = email.toLowerCase()
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) {
      throw error
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail)

    if (match) {
      return match
    }

    if (data.users.length < 200) {
      return null
    }

    page += 1
  }
}

async function ensureAuthUser(email: string, password: string, fullName: string) {
  const existingUser = await findAuthUserByEmail(email)

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    })

    if (error || !data.user) {
      throw error ?? new Error(`Unable to update auth user for ${email}`)
    }

    return data.user
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  })

  if (error || !data.user) {
    throw error ?? new Error(`Unable to create auth user for ${email}`)
  }

  return data.user
}

async function ensureArtistProfile(userId: string, fullName: string, country: string, bio: string) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      role: "artist",
      country,
      bio,
    },
    {
      onConflict: "id",
    },
  )

  if (error) {
    throw error
  }
}

async function ensureArtistRecord(userId: string, stageName: string, email: string, country: string, bio: string) {
  const { data: existingArtist, error: existingArtistError } = await supabase
    .from("artists")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (existingArtistError) {
    throw existingArtistError
  }

  if (existingArtist) {
    const { error } = await supabase
      .from("artists")
      .update({
        name: stageName,
        email,
        country,
        bio,
        is_active: true,
      })
      .eq("id", existingArtist.id)

    if (error) {
      throw error
    }

    return existingArtist.id
  }

  const { data: createdArtist, error } = await supabase
    .from("artists")
    .insert({
      user_id: userId,
      name: stageName,
      email,
      country,
      bio,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>()

  if (error || !createdArtist) {
    throw error ?? new Error(`Unable to create artist record for ${email}`)
  }

  return createdArtist.id
}

export async function ensureSmokeArtist(input: ArtistSeedInput) {
  const user = await ensureAuthUser(input.email, input.password, input.fullName)
  await ensureArtistProfile(user.id, input.fullName, input.country, input.bio)
  const artistId = await ensureArtistRecord(user.id, input.stageName, input.email, input.country, input.bio)

  return {
    userId: user.id,
    artistId,
  }
}

export async function createSmokeArtistRecordForUser(input: SharedArtistInput) {
  const { data: artist, error } = await supabase
    .from("artists")
    .insert({
      user_id: input.userId,
      name: input.stageName,
      email: input.email,
      country: input.country,
      bio: input.bio,
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>()

  if (error || !artist) {
    throw error ?? new Error(`Unable to create shared artist record for ${input.email}`)
  }

  return artist.id
}

export async function getSmokeArtistCountForUser(userId: string) {
  const { count, error } = await supabase
    .from("artists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function insertSmokeCsvUpload(input: CsvUploadSeedInput) {
  const { data: upload, error } = await supabase
    .from("csv_uploads")
    .insert({
      uploaded_by: input.uploadedBy,
      artist_id: input.artistId,
      filename: input.filename,
      file_url: `csv/${input.artistId}/${input.filename}`,
      status: "failed",
      period_month: input.periodMonth,
      checksum: input.checksum,
    })
    .select("id")
    .single<{ id: string }>()

  if (error || !upload) {
    throw error ?? new Error(`Unable to seed CSV upload for ${input.artistId}`)
  }

  return upload.id
}

export async function countSmokeCsvUploadsForArtist(artistId: string, checksum?: string) {
  let query = supabase
    .from("csv_uploads")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)

  if (checksum) {
    query = query.eq("checksum", checksum)
  }

  const { count, error } = await query

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokeEarningsForArtist(artistId: string) {
  const { count, error } = await supabase
    .from("earnings")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokeMonthlyEarningsSummaryCacheRowsForArtist(artistId: string) {
  const { count, error } = await supabase
    .from("monthly_earnings_summary_cache")
    .select("artist_id", { count: "exact", head: true })
    .eq("artist_id", artistId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function refreshSmokeMonthlyEarningsSummary(artistId: string, month: string) {
  const { error } = await supabase.rpc("refresh_monthly_earnings_summary_for_artist_month", {
    target_artist_id: artistId,
    target_month: month,
  })

  if (error) {
    throw error
  }
}

export async function fetchSmokeAdminAnalyticsRevenueRows() {
  const { data, error } = await supabase.rpc("get_admin_analytics_revenue_rows", {
    target_period_start_month: null,
    target_period_end_month: null,
  })

  if (error) {
    throw error
  }

  return (Array.isArray(data) ? data : []) as AdminAnalyticsRevenueRpcRow[]
}

export async function countSmokePayoutRequests(requestId: string) {
  const { count, error } = await supabase
    .from("payout_requests")
    .select("id", { count: "exact", head: true })
    .eq("id", requestId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokeLedgerRowsForReference(referenceId: string) {
  const { count, error } = await supabase
    .from("transaction_ledger")
    .select("id", { count: "exact", head: true })
    .eq("reference_id", referenceId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokeManualPayoutLedgerRows(requestId: string) {
  const { count, error } = await supabase
    .from("transaction_ledger")
    .select("id", { count: "exact", head: true })
    .in("idempotency_key", [
      `admin_manual_payout:${requestId}`,
      `admin_manual_payout_service_charge:${requestId}`,
    ])

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokePayoutFinancialLedgerRows(requestId: string) {
  const { count, error } = await supabase
    .from("transaction_ledger")
    .select("id", { count: "exact", head: true })
    .in("idempotency_key", [
      `payout_pending:${requestId}`,
      `admin_manual_payout:${requestId}`,
      `admin_payout_service_charge:${requestId}`,
      `admin_manual_payout_service_charge:${requestId}`,
    ])

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokeLedgerRowsForArtist(artistId: string) {
  const { count, error } = await supabase
    .from("transaction_ledger")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokePublishingEarningsForArtist(artistId: string) {
  const { count, error } = await supabase
    .from("publishing_earnings")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokePublishingRegistrationTracksForArtist(artistId: string) {
  const { count, error } = await supabase
    .from("publishing_registration_tracks")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokeDuesById(dueId: string) {
  const { count, error } = await supabase
    .from("dues")
    .select("id", { count: "exact", head: true })
    .eq("id", dueId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function insertSmokePayoutRequest(input: PayoutRequestSeedInput) {
  const { data: request, error: requestError } = await supabase
    .from("payout_requests")
    .insert({
      artist_id: input.artistId,
      requested_by: input.requestedBy,
      amount: input.amount,
      status: input.status ?? "pending",
      artist_notes: "Smoke payout edit test",
    })
    .select("id")
    .single<{ id: string }>()

  if (requestError || !request) {
    throw requestError ?? new Error(`Unable to seed payout request for ${input.artistId}`)
  }

  const { error: ledgerError } = await supabase
    .from("transaction_ledger")
    .insert({
      artist_id: input.artistId,
      type: "payout_pending",
      reference_id: request.id,
      amount: `-${input.amount}`,
      balance_after: `-${input.amount}`,
      description: "Payout requested",
      idempotency_key: `payout_pending:${request.id}`,
    })

  if (ledgerError) {
    throw ledgerError
  }

  await supabase.rpc("recalculate_artist_ledger_balances", {
    target_artist_id: input.artistId,
  })

  return request.id
}

export async function insertSmokeCatalogTrack(input: CatalogTrackSeedInput) {
  const { data: release, error: releaseError } = await supabase
    .from("releases")
    .insert({
      artist_id: input.artistId,
      title: input.releaseTitle,
      type: "single",
      genre: "Other",
      upc: input.upc ?? null,
      status: "live",
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>()

  if (releaseError || !release) {
    throw releaseError ?? new Error(`Unable to seed publishing smoke release for ${input.artistId}`)
  }

  const { data: track, error: trackError } = await supabase
    .from("tracks")
    .insert({
      release_id: release.id,
      title: input.trackTitle,
      isrc: input.isrc,
      track_number: 1,
      status: "live",
      is_active: true,
    })
    .select("id")
    .single<{ id: string }>()

  if (trackError || !track) {
    throw trackError ?? new Error(`Unable to seed publishing smoke track for ${input.artistId}`)
  }

  if (input.creditedName) {
    const { error: creditError } = await supabase
      .from("track_credits")
      .insert({
        track_id: track.id,
        credited_name: input.creditedName,
        role_code: "Featured Artist",
        sort_order: 200,
      })

    if (creditError) {
      throw creditError
    }
  }

  return {
    releaseId: release.id,
    trackId: track.id,
  }
}

export async function getSmokeTrackByIsrc(isrc: string) {
  const { data, error } = await supabase
    .from("tracks")
    .select("id, artist_id, release_id, title, isrc, version_line, releases!inner(id, artist_id, title, upc, status, is_active)")
    .eq("isrc", isrc)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function getSmokeTrackByIsrcForArtist(isrc: string, artistId: string) {
  const { data, error } = await supabase
    .from("tracks")
    .select("id, artist_id, release_id, title, isrc, version_line, releases!inner(id, artist_id, title, upc, status, is_active)")
    .eq("artist_id", artistId)
    .eq("isrc", isrc)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function countSmokeTracksByIsrcForArtist(isrc: string, artistId: string) {
  const { count, error } = await supabase
    .from("tracks")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", artistId)
    .eq("isrc", isrc)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function countSmokeTracksByIsrc(isrc: string) {
  const { count, error } = await supabase
    .from("tracks")
    .select("id", { count: "exact", head: true })
    .eq("isrc", isrc)

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function getSmokeTrackCredits(trackId: string) {
  const { data, error } = await supabase
    .from("track_credits")
    .select("credited_name, role_code, sort_order, linked_artist_id")
    .eq("track_id", trackId)
    .order("sort_order", { ascending: true })
    .order("credited_name", { ascending: true })

  if (error) {
    throw error
  }

  return data ?? []
}

export async function archiveSmokeReleaseDirectly(releaseId: string) {
  const { error } = await supabase
    .from("releases")
    .update({
      status: "deleted",
      is_active: false,
    })
    .eq("id", releaseId)

  if (error) {
    throw error
  }
}

async function ensureSmokeCsvUploadBucket() {
  const { data, error } = await supabase.storage.getBucket(CSV_UPLOAD_BUCKET)

  if (data && !error) {
    return
  }

  if (error && !/not found/i.test(error.message ?? "")) {
    throw error
  }

  const { error: createError } = await supabase.storage.createBucket(CSV_UPLOAD_BUCKET, {
    public: false,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["text/csv", "text/plain", "application/vnd.ms-excel"],
  })

  if (createError && !/already exists/i.test(createError.message)) {
    throw createError
  }
}

export async function insertSmokeRoyaltyPreviewUpload(input: RoyaltyPreviewUploadSeedInput) {
  await ensureSmokeCsvUploadBucket()

  const { data: upload, error: uploadError } = await supabase
    .from("csv_uploads")
    .insert({
      uploaded_by: input.uploadedBy,
      artist_id: input.artistId,
      filename: input.filename,
      file_url: `csv/${input.artistId}/${input.checksum}.csv`,
      status: "processing",
      period_month: input.periodMonth,
      checksum: input.checksum,
    })
    .select("id, file_url")
    .single<{ id: string; file_url: string }>()

  if (uploadError || !upload) {
    throw uploadError ?? new Error(`Unable to seed royalty preview upload for ${input.artistId}`)
  }

  const { error: storageError } = await supabase.storage
    .from(CSV_UPLOAD_BUCKET)
    .upload(upload.file_url, Buffer.from(input.csvText, "utf8"), {
      contentType: "text/csv",
      upsert: true,
    })

  if (storageError) {
    throw storageError
  }

  return upload.id
}

export async function insertSmokeEarning(input: EarningSeedInput) {
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .upsert(
      {
        raw_name: "Smoke DSP",
        display_name: "Smoke DSP",
      },
      {
        onConflict: "raw_name",
      },
    )
    .select("id")
    .single<{ id: string }>()

  if (channelError || !channel) {
    throw channelError ?? new Error("Unable to seed smoke channel")
  }

  const { data: upload, error: uploadError } = await supabase
    .from("csv_uploads")
    .insert({
      uploaded_by: input.uploadedBy,
      artist_id: input.artistId,
      filename: input.filename,
      file_url: `csv/${input.artistId}/${input.filename}`,
      status: "completed",
      row_count: 1,
      matched_count: 1,
      unmatched_count: 0,
      total_amount: input.amount,
      total_units: input.units ?? 1,
      period_start: input.periodMonth,
      period_end: input.periodMonth,
      period_month: input.periodMonth,
      checksum: input.checksum,
    })
    .select("id")
    .single<{ id: string }>()

  if (uploadError || !upload) {
    throw uploadError ?? new Error(`Unable to seed smoke earnings upload for ${input.artistId}`)
  }

  const { error: earningError } = await supabase.from("earnings").insert({
    artist_id: input.artistId,
    track_id: input.trackId,
    release_id: input.releaseId,
    channel_id: channel.id,
    upload_id: upload.id,
    sale_date: input.periodMonth,
    accounting_date: input.periodMonth,
    territory: "NP",
    units: input.units ?? 1,
    unit_price: input.amount,
    total_amount: input.amount,
    earning_type: "original",
    csv_row_number: 1,
  })

  if (earningError) {
    throw earningError
  }

  return upload.id
}

export async function insertSmokePublishingWriter(input: PublishingWriterSeedInput) {
  const { data, error } = await supabase
    .from("publishing_writers")
    .insert({
      full_name: input.fullName,
      ipi_number: input.ipiNumber ?? null,
      pro_name: input.proName ?? null,
    })
    .select("id")
    .single<{ id: string }>()

  if (error || !data) {
    throw error ?? new Error(`Unable to seed publishing writer ${input.fullName}`)
  }

  return data.id
}

export async function upsertSmokeArtistPublishingInfo(input: ArtistPublishingInfoSeedInput) {
  const { error } = await supabase
    .from("artist_publishing_info")
    .upsert({
      artist_id: input.artistId,
      legal_name: input.legalName,
      ipi_number: input.ipiNumber ?? null,
      pro_name: input.proName ?? null,
    }, {
      onConflict: "artist_id",
    })

  if (error) {
    throw error
  }
}

export async function countSmokePublishingWritersByIdentity(input: PublishingWriterSeedInput) {
  let query = supabase
    .from("publishing_writers")
    .select("id, full_name, ipi_number, pro_name")
    .eq("full_name", input.fullName)

  query = input.ipiNumber ? query.eq("ipi_number", input.ipiNumber) : query.is("ipi_number", null)
  query = input.proName ? query.eq("pro_name", input.proName) : query.is("pro_name", null)

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data ?? []).length
}

export async function countSmokePublishingWritersByIpi(ipiNumber: string) {
  const { data, error } = await supabase
    .from("publishing_writers")
    .select("id")
    .eq("ipi_number", ipiNumber)

  if (error) {
    throw error
  }

  return (data ?? []).length
}

export async function countSmokeArtistPublishingWriterLinks(artistId: string, writerName: string) {
  const { data, error } = await supabase
    .from("artist_publishing_writers")
    .select("id, publishing_writers!inner(full_name)")
    .eq("artist_id", artistId)
    .eq("publishing_writers.full_name", writerName)

  if (error) {
    throw error
  }

  return (data ?? []).length
}

export async function deleteSmokePublishingRegistrationsForArtist(artistId: string) {
  const { error } = await supabase
    .from("publishing_registration_batches")
    .delete()
    .eq("artist_id", artistId)

  if (error) {
    throw error
  }
}

export async function deleteSmokePublishingWritersByNames(fullNames: string[]) {
  if (!fullNames.length) {
    return
  }

  const { data, error } = await supabase
    .from("publishing_writers")
    .select("id")
    .in("full_name", fullNames)

  if (error) {
    throw error
  }

  const writerIds = (data ?? []).map((writer: { id: string }) => writer.id)

  if (!writerIds.length) {
    return
  }

  const { error: linkError } = await supabase
    .from("artist_publishing_writers")
    .delete()
    .in("writer_id", writerIds)

  if (linkError) {
    throw linkError
  }

  const { error: writerError } = await supabase
    .from("publishing_writers")
    .delete()
    .in("id", writerIds)

  if (writerError) {
    throw writerError
  }
}

export async function purgeSmokeArtistWithRpc(artistId: string) {
  const { data, error } = await supabase.rpc("admin_purge_artist", {
    target_artist_uuid: artistId,
  })

  if (error) {
    throw error
  }

  return (Array.isArray(data) ? data[0] : data) as AdminPurgeArtistResult
}

export async function generateRecoveryLink(email: string, redirectTo: string) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo,
    },
  })

  if (error || !data.properties?.action_link) {
    throw error ?? new Error(`Unable to generate a recovery link for ${email}`)
  }

  return data.properties.action_link
}

export async function generateRecoveryData(email: string, redirectTo: string) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo,
    },
  })

  if (error || !data.properties?.hashed_token) {
    throw error ?? new Error(`Unable to generate recovery data for ${email}`)
  }

  const recoveryUrl = new URL(redirectTo)
  recoveryUrl.searchParams.set("token_hash", data.properties.hashed_token)
  recoveryUrl.searchParams.set("type", data.properties.verification_type ?? "recovery")

  return {
    actionLink: recoveryUrl.toString(),
    tokenHash: data.properties.hashed_token,
    type: data.properties.verification_type,
  }
}
