import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  normalizeOptionalHttpUrl,
  normalizeOptionalText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import type { UpdateAdminChannelInput } from "~~/types/settings"

function normalizeOptionalHexColor(value: unknown) {
  const normalized = String(value ?? "").trim()

  if (!normalized) {
    return null
  }

  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Channel color must use #RGB or #RRGGBB format.",
    })
  }

  return normalized.toUpperCase()
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const channelId = normalizeRequiredUuid(event.context.params?.id, "Channel id")
  const body = await readBody<UpdateAdminChannelInput>(event)
  const update: Record<string, unknown> = {}

  if (body?.displayName !== undefined) {
    update.display_name = normalizeOptionalText(body.displayName)
  }

  if (body?.iconUrl !== undefined) {
    update.icon_url = normalizeOptionalHttpUrl(body.iconUrl, "Channel icon URL")
  }

  if (body?.color !== undefined) {
    update.color = normalizeOptionalHexColor(body.color)
  }

  if (!Object.keys(update).length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No channel changes were provided.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)

  const { data: existingChannel, error: existingChannelError } = await supabase
    .from("channels")
    .select("id, raw_name")
    .eq("id", channelId)
    .maybeSingle<{ id: string; raw_name: string }>()

  if (existingChannelError) {
    throw createError({
      statusCode: 500,
      statusMessage: existingChannelError.message,
    })
  }

  if (!existingChannel) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected channel does not exist.",
    })
  }

  const { data, error } = await supabase
    .from("channels")
    .update(update)
    .eq("id", channelId)
    .select("id, raw_name, display_name, icon_url, color, created_at, updated_at")
    .single()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "channel.updated", "channel", channelId, {
    channel_raw_name: existingChannel.raw_name,
    fields: Object.keys(update),
  })

  return {
    ok: true,
    channel: {
      id: data.id,
      rawName: data.raw_name,
      displayName: data.display_name,
      iconUrl: data.icon_url,
      color: data.color,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  }
})
