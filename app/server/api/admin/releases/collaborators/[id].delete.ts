import { createError } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  throw createError({
    statusCode: 410,
    statusMessage: "Release split edits now require the versioned workflow. Use /api/admin/releases/:id/split-version instead.",
  })
})
