import { Buffer } from "node:buffer"
import { Readable } from "node:stream"
import { createError } from "h3"
import { Client } from "basic-ftp"
import type { NaadLinkSiteFile } from "~~/server/utils/naadlinks-build"

/**
 * FTP/FTPS deploy for NaadLink pages.
 *
 * The host's Imunify360 bot-protection blocks the cPanel API from cloud /
 * automation IPs, so files are pushed over FTP instead (a protocol it doesn't
 * challenge). FTP can't create subdomains, so each subdomain is pre-created in
 * cPanel; we verify its document root exists, then upload into `<docroot>/<slug>`.
 */

export interface FtpConfig {
  host: string
  port: number
  user: string
  password: string
  secure: boolean
  rootDomain: string
  docrootTemplate: string
}

function readFtpConfig(): FtpConfig {
  const { cpanel } = useRuntimeConfig() as { cpanel?: Record<string, string> }
  const c = cpanel ?? {}

  // Default the FTP host to the cPanel hostname (sans protocol/port).
  let host = (c.ftpHost || "").trim()
  if (!host && c.host) {
    try {
      host = new URL(c.host).hostname
    } catch {
      host = c.host.replace(/^https?:\/\//, "").replace(/:\d+.*$/, "")
    }
  }

  return {
    host,
    port: Number(c.ftpPort || 21) || 21,
    user: (c.ftpUser || c.user || "").trim(),
    password: c.ftpPassword || "",
    secure: String(c.ftpSecure ?? "true") !== "false",
    rootDomain: c.rootDomain || "naad.link",
    docrootTemplate: c.docrootTemplate || "{subdomain}.{rootDomain}",
  }
}

export function getFtpConfig(): FtpConfig {
  return readFtpConfig()
}

export function isFtpConfigured(): boolean {
  const c = readFtpConfig()
  return Boolean(c.host && c.user && c.password)
}

function requireFtpConfig(): FtpConfig {
  const c = readFtpConfig()
  if (!c.host || !c.user || !c.password) {
    throw createError({
      statusCode: 503,
      statusMessage: "FTP is not configured. Set CPANEL_FTP_HOST/USER/PASSWORD.",
    })
  }
  return c
}

/** The subdomain's document root, relative to the FTP home dir. */
export function subdomainDocroot(subdomain: string, config = readFtpConfig()): string {
  return config.docrootTemplate
    .replace(/\{subdomain\}/g, subdomain)
    .replace(/\{rootDomain\}/g, config.rootDomain)
    .replace(/^\/+|\/+$/g, "")
}

async function connect(config: FtpConfig): Promise<Client> {
  const client = new Client(30_000)
  client.ftp.verbose = false
  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      secure: config.secure,
      // cPanel FTPS certs often don't match the bare server hostname.
      secureOptions: { rejectUnauthorized: false },
    })
  } catch (caught: any) {
    client.close()
    throw createError({ statusCode: 502, statusMessage: `FTP login failed: ${caught?.message || caught}` })
  }
  return client
}

/** Verifies credentials by opening a session and reading the home directory. */
export async function testFtpConnection(): Promise<{ ok: true; entries: number }> {
  const config = requireFtpConfig()
  const client = await connect(config)
  try {
    const list = await client.list()
    return { ok: true, entries: list.length }
  } finally {
    client.close()
  }
}

/** True if the subdomain's document root already exists on the server. */
export async function subdomainExists(subdomain: string): Promise<boolean> {
  const config = requireFtpConfig()
  const client = await connect(config)
  try {
    const dir = subdomainDocroot(subdomain, config)
    await client.cd(`/${dir}`)
    return true
  } catch {
    return false
  } finally {
    client.close()
  }
}

export interface FtpDeployResult {
  domain: string
  remoteDir: string
  fileCount: number
}

/**
 * Uploads the built site into `<subdomain docroot>/<slug>` over FTP. Fails
 * clearly if the subdomain's document root doesn't exist yet (pre-create it in
 * cPanel). Existing files under the slug folder are overwritten.
 */
export async function deployViaFtp(input: {
  subdomain: string
  slug: string
  files: NaadLinkSiteFile[]
}): Promise<FtpDeployResult> {
  const config = requireFtpConfig()
  const docroot = subdomainDocroot(input.subdomain, config)
  const client = await connect(config)

  try {
    // Confirm the subdomain's doc root exists — otherwise we'd create a stray
    // folder that no subdomain actually serves.
    try {
      await client.cd(`/${docroot}`)
    } catch {
      throw createError({
        statusCode: 404,
        statusMessage:
          `The subdomain "${input.subdomain}.${config.rootDomain}" isn't set up on the server ` +
          `(no folder at /${docroot}). Create the subdomain in cPanel first, ` +
          `or adjust CPANEL_DOCROOT_TEMPLATE to match its document root.`,
      })
    }

    const remoteDir = `/${docroot}/${input.slug}`.replace(/\/+/g, "/")
    await client.ensureDir(remoteDir) // creates the slug folder; cwd is now there

    // Upload each file, creating nested dirs (_next/…) as needed. ensureDir
    // changes cwd, so re-anchor to remoteDir before each upload.
    for (const file of input.files) {
      const segments = file.name.split("/")
      const fileName = segments.pop() as string
      const subDir = segments.join("/")
      const targetDir = subDir ? `${remoteDir}/${subDir}` : remoteDir
      await client.ensureDir(targetDir)
      await client.uploadFrom(Readable.from(file.data), fileName)
    }

    return {
      domain: `${input.subdomain}.${config.rootDomain}`,
      remoteDir,
      fileCount: input.files.length,
    }
  } finally {
    client.close()
  }
}
