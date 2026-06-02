import { createError, getRequestHeader, type H3Event } from "h3"

interface RateLimitBucket {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  key: string
  limit: number
  windowMs: number
  message?: string
}

const buckets = new Map<string, RateLimitBucket>()

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function requestRateLimitKey(event: H3Event, scope: string, identity = "anonymous") {
  const forwardedFor = getRequestHeader(event, "x-forwarded-for")
  const forwardedIp = forwardedFor?.split(",")[0]?.trim()
  const realIp = getRequestHeader(event, "x-real-ip")?.trim()
  const socketIp = event.node.req.socket.remoteAddress ?? "unknown"
  const ip = forwardedIp || realIp || socketIp

  return `${scope}:${identity}:${ip}`
}

export function assertRateLimitCapacity(options: RateLimitOptions) {
  const now = Date.now()
  pruneExpiredBuckets(now)

  const bucket = buckets.get(options.key)

  if (bucket && bucket.count >= options.limit && bucket.resetAt > now) {
    throw createError({
      statusCode: 429,
      statusMessage: options.message || "Too many attempts. Try again later.",
    })
  }
}

export function recordRateLimitAttempt(options: RateLimitOptions) {
  const now = Date.now()
  pruneExpiredBuckets(now)

  const bucket = buckets.get(options.key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(options.key, {
      count: 1,
      resetAt: now + options.windowMs,
    })
    return
  }

  bucket.count += 1

  if (bucket.count > options.limit) {
    throw createError({
      statusCode: 429,
      statusMessage: options.message || "Too many attempts. Try again later.",
    })
  }
}

export function consumeRateLimit(options: RateLimitOptions) {
  assertRateLimitCapacity(options)
  recordRateLimitAttempt(options)
}

export function resetRateLimit(key: string) {
  buckets.delete(key)
}
