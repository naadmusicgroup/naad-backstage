import { createError } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  throw createError({
    statusCode: 410,
    statusMessage: "Manual analytics snapshots are retired. Commit CSV uploads to update stream analytics.",
  })
})
