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

async function findAuthUserByEmail(email: string) {
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

  return {
    actionLink: data.properties.action_link,
    tokenHash: data.properties.hashed_token,
    type: data.properties.verification_type,
  }
}
