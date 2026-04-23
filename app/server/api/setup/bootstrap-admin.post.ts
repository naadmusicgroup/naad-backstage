import { createError, readBody } from "h3"
import { isSupabaseSchemaNotReadyError, serverSupabaseServiceRole } from "~~/server/utils/supabase"

interface BootstrapAdminBody {
  email?: string
  password?: string
  fullName?: string
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

export default defineEventHandler(async (event) => {
  const body = await readBody<BootstrapAdminBody>(event)
  const email = normalizeEmail(body.email ?? "")
  const password = (body.password ?? "").trim()
  const fullName = (body.fullName ?? "").trim()

  if (!fullName || fullName.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: "Full name must be at least 2 characters.",
    })
  }

  if (!email.includes("@")) {
    throw createError({
      statusCode: 400,
      statusMessage: "A valid email address is required.",
    })
  }

  if (password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: "Password must be at least 8 characters.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)

  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("role", "admin")

  if (countError) {
    if (isSupabaseSchemaNotReadyError(countError)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Database setup is not complete yet. Apply the Supabase migrations before creating the first admin.",
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: countError.message,
    })
  }

  if ((count ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: "The first admin has already been created. Sign in instead.",
    })
  }

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
      statusMessage: createUserError?.message || "Unable to create the admin account.",
    })
  }

  const createdUser = createdUserResult.user

  const { error: profileError } = await supabase.from("profiles").insert({
    id: createdUser.id,
    full_name: fullName,
    role: "admin",
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(createdUser.id)

    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  return {
    ok: true,
    userId: createdUser.id,
    email,
  }
})
