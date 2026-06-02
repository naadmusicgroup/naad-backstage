import { deleteAdminVerification } from "~~/server/utils/admin-verification"
import { requireAdminProfile } from "~~/server/utils/auth"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  deleteAdminVerification(event)

  return {
    ok: true,
  }
})
