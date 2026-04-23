import { createError } from "h3"
import {
  isSupabaseConnectivityError,
  isSupabaseSchemaNotReadyError,
  serverSupabaseServiceRole,
} from "~~/server/utils/supabase"

export default defineEventHandler(async (event) => {
  try {
    const supabase = serverSupabaseServiceRole(event)
    const { count: profileCount, error: profileError } = await supabase.from("profiles").select("id", {
      count: "exact",
      head: true,
    })

    if (profileError) {
      throw profileError
    }

    const { count: adminCount, error: adminError } = await supabase
      .from("profiles")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("role", "admin")

    if (adminError) {
      throw adminError
    }

    const safeProfileCount = profileCount ?? 0
    const safeAdminCount = adminCount ?? 0

    return {
      schemaReady: true,
      profileCount: safeProfileCount,
      adminCount: safeAdminCount,
      needsBootstrap: safeAdminCount === 0,
    }
  } catch (error: any) {
    if (isSupabaseSchemaNotReadyError(error)) {
      return {
        schemaReady: false,
        profileCount: 0,
        adminCount: 0,
        needsBootstrap: false,
      }
    }

    if (isSupabaseConnectivityError(error)) {
      throw createError({
        statusCode: 503,
        statusMessage: "Server could not reach Supabase. Check the deployment Supabase URL and server key.",
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: error?.message || "Unable to load setup status.",
    })
  }
})
