import { createError } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  throw createError({
    statusCode: 410,
    statusMessage: "Track split edits now require the versioned workflow. Use /api/admin/tracks/:id/split-version instead.",
  })
})
