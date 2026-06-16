import { requireAdminProfile } from "~~/server/utils/auth"
import { getFtpConfig, isFtpConfigured, testFtpConnection } from "~~/server/utils/ftp-deploy"

/** Health check for the FTP deploy connection (admin UI badge). */
export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const config = getFtpConfig()
  if (!isFtpConfigured()) {
    return {
      configured: false,
      ok: false,
      rootDomain: config.rootDomain,
      error: "FTP credentials are not set on the server.",
    }
  }

  try {
    await testFtpConnection()
    return {
      configured: true,
      ok: true,
      host: config.host,
      rootDomain: config.rootDomain,
    }
  } catch (caught: any) {
    return {
      configured: true,
      ok: false,
      host: config.host,
      rootDomain: config.rootDomain,
      error: caught?.statusMessage || caught?.message || "Connection failed.",
    }
  }
})
