import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"

interface CreateArtistBody {
  stageName?: string
  email?: string
  password?: string
  fullName?: string
  country?: string
  bio?: string
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const body = await readBody<CreateArtistBody>(event)
  const stageName = (body.stageName ?? "").trim()
  const email = normalizeEmail(body.email ?? "")
  const password = (body.password ?? "").trim()
  const fullName = (body.fullName ?? stageName).trim()
  const country = (body.country ?? "").trim() || null
  const bio = (body.bio ?? "").trim() || null

  if (!stageName || stageName.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: "Stage name must be at least 2 characters.",
    })
  }

  if (!email.includes("@")) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid artist email address is required.",
    })
  }

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: "Artist password must be at least 8 characters.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data: createdUserResult, error: createUserError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
    },
  })

  if (createUserError || !createdUserResult.user) {
    throw createError({
      statusCode: 500,
      statusMessage: createUserError?.message || "Unable to create the artist auth account.",
    })
  }

  const createdUser = createdUserResult.user

  const { error: profileError } = await supabase.from("profiles").insert({
    id: createdUser.id,
    full_name: fullName,
    role: "artist",
    country,
    bio,
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(createdUser.id)

    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .insert({
      user_id: createdUser.id,
      name: stageName,
      email,
      country,
      bio,
      is_active: true,
    })
    .select("id, name, email")
    .single()

  if (artistError || !artist) {
    await supabase.from("profiles").delete().eq("id", createdUser.id)
    await supabase.auth.admin.deleteUser(createdUser.id)

    throw createError({
      statusCode: 500,
      statusMessage: artistError?.message || "Unable to create the artist record.",
    })
  }

  return {
    ok: true,
    artist,
    userId: createdUser.id,
  }
})
