import type { SupabaseClient } from "@supabase/supabase-js"
import { createError } from "h3"

export async function logAdminActivity(
  supabase: SupabaseClient<any>,
  adminId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  const { error } = await supabase.from("admin_activity_log").insert({
    admin_id: adminId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  })

  if (error) {
    console.error("Unable to write admin audit log", {
      action,
      adminId,
      entityType,
      entityId,
      error: error.message,
    })

    throw createError({
      statusCode: 500,
      statusMessage: "Unable to write the required admin audit log.",
    })
  }
}
