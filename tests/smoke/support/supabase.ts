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

interface AdminPurgeArtistResult {
  artist_id: string
  linked_user_id: string | null
  profile_became_unused: boolean
  remaining_linked_artist_count: number
}

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
