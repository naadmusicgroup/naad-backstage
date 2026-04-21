import { createError } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"

export default defineEventHandler(async (event) => {
  const supabase = serverSupabaseServiceRole(event)
  const { count: profileCount, error: profileError } = await supabase.from("profiles").select("id", {
    count: "exact",
    head: true,
  })

  if (profileError) {
    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  const { count: adminCount, error: adminError } = await supabase
    .from("profiles")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("role", "admin")

  if (adminError) {
    throw createError({
      statusCode: 500,
      statusMessage: adminError.message,
    })
  }

  const safeProfileCount = profileCount ?? 0
  const safeAdminCount = adminCount ?? 0

  return {
    schemaReady: true,
    profileCount: safeProfileCount,
    adminCount: safeAdminCount,
    needsBootstrap: safeAdminCount === 0,
  }
})
