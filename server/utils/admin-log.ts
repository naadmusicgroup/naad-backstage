import type { SupabaseClient } from "@supabase/supabase-js"

export async function logAdminActivity(
  supabase: SupabaseClient<any>,
  adminId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  await supabase.from("admin_activity_log").insert({
    admin_id: adminId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  })
}
