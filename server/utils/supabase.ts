import {
  serverSupabaseClient as baseServerSupabaseClient,
  serverSupabaseServiceRole as baseServerSupabaseServiceRole,
  serverSupabaseUser as baseServerSupabaseUser,
} from "#supabase/server"
import { type H3Event } from "h3"
import { useRuntimeConfig } from "#imports"

function decodeJwtPayload(token?: string | null): Record<string, unknown> | null {
  if (!token) {
    return null
  }

  const [, payload] = token.split(".")

  if (!payload) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
}

function deriveCanonicalSupabaseUrl(...tokens: Array<string | null | undefined>) {
  for (const token of tokens) {
    const payload = decodeJwtPayload(token)
    const projectRef = typeof payload?.ref === "string" ? payload.ref.trim() : ""

    if (projectRef) {
      return `https://${projectRef}.supabase.co`
    }
  }

  return ""
}

function resolveServerSupabaseUrl(event: H3Event) {
  const config = useRuntimeConfig(event) as any
  const configuredUrl = String(config.public?.supabase?.url ?? "").trim()
  const publicKey = String(config.public?.supabase?.key ?? "").trim()
  const serverKey = String(config.supabase?.secretKey ?? config.supabase?.serviceKey ?? "").trim()
  const fallbackUrl = deriveCanonicalSupabaseUrl(serverKey, publicKey)

  if (!configuredUrl) {
    return fallbackUrl
  }

  try {
    const hostname = new URL(configuredUrl).hostname

    if (hostname.endsWith(".supabase.co")) {
      return configuredUrl
    }
  } catch {
    return fallbackUrl || configuredUrl
  }

  return fallbackUrl || configuredUrl
}

export function isSupabaseSchemaNotReadyError(error: any) {
  return error?.code === "42P01" || error?.code === "42703"
}

export function isSupabaseConnectivityError(error: any) {
  const message = String(error?.message ?? "")
  return error instanceof TypeError || /fetch failed/i.test(message)
}

async function withResolvedServerSupabaseUrl<T>(event: H3Event, operation: () => Promise<T> | T) {
  const config = useRuntimeConfig(event) as any
  const configuredUrl = String(config.public?.supabase?.url ?? "").trim()
  const resolvedUrl = resolveServerSupabaseUrl(event)

  if (!resolvedUrl || resolvedUrl === configuredUrl) {
    return await operation()
  }

  config.public.supabase.url = resolvedUrl

  try {
    return await operation()
  } finally {
    config.public.supabase.url = configuredUrl
  }
}

export const serverSupabaseClient: typeof baseServerSupabaseClient = async (event) => {
  return await withResolvedServerSupabaseUrl(event, () => baseServerSupabaseClient(event))
}

export const serverSupabaseServiceRole: typeof baseServerSupabaseServiceRole = (event) => {
  const config = useRuntimeConfig(event) as any
  const configuredUrl = String(config.public?.supabase?.url ?? "").trim()
  const resolvedUrl = resolveServerSupabaseUrl(event)

  if (!resolvedUrl || resolvedUrl === configuredUrl) {
    return baseServerSupabaseServiceRole(event)
  }

  config.public.supabase.url = resolvedUrl

  try {
    return baseServerSupabaseServiceRole(event)
  } finally {
    config.public.supabase.url = configuredUrl
  }
}

export const serverSupabaseUser: typeof baseServerSupabaseUser = async (event) => {
  return await withResolvedServerSupabaseUrl(event, () => baseServerSupabaseUser(event))
}
