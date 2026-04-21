import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

const defaultSmokeValues = {
  SMOKE_ADMIN_EMAIL: "smoke-admin@naad-backstage.local",
  SMOKE_ADMIN_PASSWORD: "SmokeAdmin123!",
  SMOKE_ADMIN_FULL_NAME: "Smoke Admin",
  SMOKE_ARTIST_EMAIL: "smoke-artist@naad-backstage.local",
  SMOKE_ARTIST_PASSWORD: "SmokeArtist123!",
  SMOKE_ARTIST_FULL_NAME: "Smoke Artist",
  SMOKE_ARTIST_STAGE_NAME: "Smoke Artist",
  SMOKE_ARTIST_COUNTRY: "Nepal",
  SMOKE_ARTIST_BIO: "Smoke test artist account",
}

function parseEnvFile(content) {
  const values = {}

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

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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

function readEnv(name) {
  return process.env[name] ?? localEnv[name] ?? defaultSmokeValues[name] ?? ""
}

function requireEnv(name) {
  const value = readEnv(name)

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

const supabaseUrl = requireEnv("NUXT_PUBLIC_SUPABASE_URL")
const supabaseSecretKey = requireEnv("SUPABASE_SECRET_KEY")
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

async function findAuthUserByEmail(email) {
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

async function ensureAuthUser({ email, password, fullName }) {
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

    return {
      user: data.user,
      action: "updated",
    }
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

  return {
    user: data.user,
    action: "created",
  }
}

async function ensureAdminProfile(userId, fullName) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      role: "admin",
    },
    {
      onConflict: "id",
    },
  )

  if (error) {
    throw error
  }
}

async function clearUserMfaFactors(userId) {
  const { data, error } = await supabase.auth.admin.mfa.listFactors({
    userId,
  })

  if (error) {
    throw error
  }

  for (const factor of data.factors ?? []) {
    const { error: deleteError } = await supabase.auth.admin.mfa.deleteFactor({
      userId,
      id: factor.id,
    })

    if (deleteError) {
      throw deleteError
    }
  }
}

async function ensureArtistProfile(userId, fullName, country, bio) {
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

async function ensureArtistRecord(userId, stageName, email, country, bio) {
  const { data: existingArtist, error: existingArtistError } = await supabase
    .from("artists")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

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

    return {
      artistId: existingArtist.id,
      action: "updated",
    }
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
    .single()

  if (error || !createdArtist) {
    throw error ?? new Error(`Unable to create artist record for ${email}`)
  }

  return {
    artistId: createdArtist.id,
    action: "created",
  }
}

async function main() {
  const smokeAdmin = await ensureAuthUser({
    email: readEnv("SMOKE_ADMIN_EMAIL"),
    password: readEnv("SMOKE_ADMIN_PASSWORD"),
    fullName: readEnv("SMOKE_ADMIN_FULL_NAME"),
  })

  await ensureAdminProfile(smokeAdmin.user.id, readEnv("SMOKE_ADMIN_FULL_NAME"))
  await clearUserMfaFactors(smokeAdmin.user.id)

  const smokeArtist = await ensureAuthUser({
    email: readEnv("SMOKE_ARTIST_EMAIL"),
    password: readEnv("SMOKE_ARTIST_PASSWORD"),
    fullName: readEnv("SMOKE_ARTIST_FULL_NAME"),
  })

  await ensureArtistProfile(
    smokeArtist.user.id,
    readEnv("SMOKE_ARTIST_FULL_NAME"),
    readEnv("SMOKE_ARTIST_COUNTRY"),
    readEnv("SMOKE_ARTIST_BIO"),
  )

  const artistRecord = await ensureArtistRecord(
    smokeArtist.user.id,
    readEnv("SMOKE_ARTIST_STAGE_NAME"),
    readEnv("SMOKE_ARTIST_EMAIL"),
    readEnv("SMOKE_ARTIST_COUNTRY"),
    readEnv("SMOKE_ARTIST_BIO"),
  )

  console.log(
    [
      `Smoke admin ${smokeAdmin.action}: ${readEnv("SMOKE_ADMIN_EMAIL")}`,
      `Smoke artist auth ${smokeArtist.action}: ${readEnv("SMOKE_ARTIST_EMAIL")}`,
      `Smoke artist record ${artistRecord.action}: ${artistRecord.artistId}`,
    ].join("\n"),
  )
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
