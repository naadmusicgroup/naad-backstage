import { extname } from "node:path"
import archiver from "archiver"
import type { NaadLinkPayload } from "~~/types/naadlinks"

/**
 * Assembles a release's downloadable cPanel zip WITHOUT running `next build`.
 *
 * The link v2 template is pre-built once into a static shell stored in Nitro
 * server assets (`server/assets/naadlink-shell`, mounted as
 * `assets:naadlink-shell`). For each release we:
 *   1. replace the baked "/__NL_BASE__" placeholder with "/<slug>" in all text
 *      files (so assets resolve under the cPanel subfolder),
 *   2. inject the release's <title> + Open Graph / Twitter meta into index.html,
 *   3. add release.json (read at runtime by the page) + a bundled cover.jpg,
 *   4. zip it all in memory and return the Buffer (streamed as the download).
 */
const SHELL_STORAGE = "assets:naadlink-shell"
const BASE_PLACEHOLDER = "/__NL_BASE__"
const TEXT_EXTENSIONS = new Set([
  ".html", ".js", ".mjs", ".json", ".css", ".txt", ".xml", ".svg", ".webmanifest", ".map",
])

export interface BuildNaadLinkZipInput {
  slug: string
  payload: NaadLinkPayload
  /** Downloaded cover bytes, bundled as cover.jpg for a self-contained page. */
  coverBuffer: Buffer | null
  /** Absolute cover URL used for social-share previews (og:image). */
  ogImageUrl: string
  /**
   * URL prefix the deployed assets resolve under, substituted for the baked
   * "/__NL_BASE__" placeholder. Empty string (the default) = served at the
   * domain/subdomain ROOT (e.g. prabesh.naad.link/), which is the case for the
   * cPanel auto-deploy. Pass "/<slug>" only when serving from a subfolder.
   */
  basePath?: string
}

/** One file destined for the deployed site (zip entry or cPanel upload). */
export interface NaadLinkSiteFile {
  /** POSIX-style path relative to the document root, e.g. "_next/static/x.js". */
  name: string
  data: Buffer
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function upsertMeta(html: string, selector: RegExp, tag: string): string {
  if (selector.test(html)) {
    return html.replace(selector, tag)
  }

  return html.replace(/<\/head>/i, `${tag}</head>`)
}

function injectHeadMeta(html: string, input: { title: string; description: string; imageUrl: string }): string {
  const title = escapeHtml(input.title)
  const description = escapeHtml(input.description)
  const image = escapeHtml(input.imageUrl)

  let next = html

  // <title>
  if (/<title>[\s\S]*?<\/title>/i.test(next)) {
    next = next.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
  } else {
    next = next.replace(/<\/head>/i, `<title>${title}</title></head>`)
  }

  next = upsertMeta(next, /<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${description}"/>`)
  next = upsertMeta(next, /<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${title}"/>`)
  next = upsertMeta(next, /<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${description}"/>`)
  next = upsertMeta(next, /<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${image}"/>`)
  next = upsertMeta(next, /<meta name="twitter:card" content="[^"]*"\s*\/?>/i, `<meta name="twitter:card" content="summary_large_image"/>`)
  next = upsertMeta(next, /<meta name="twitter:title" content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${title}"/>`)
  next = upsertMeta(next, /<meta name="twitter:description" content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${description}"/>`)
  next = upsertMeta(next, /<meta name="twitter:image" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${image}"/>`)

  return next
}

/**
 * Builds the complete set of files for a release's deployed page, with the
 * base-path placeholder resolved and head meta injected. Returns paths relative
 * to the document root (no leading slash, no wrapping folder) so the same list
 * can be zipped for download OR pushed file-by-file into a cPanel subdomain.
 */
export async function buildNaadLinkFiles(input: BuildNaadLinkZipInput): Promise<NaadLinkSiteFile[]> {
  const storage = useStorage(SHELL_STORAGE)
  const keys = await storage.getKeys()

  if (!keys.length) {
    throw createError({
      statusCode: 500,
      statusMessage: "The NaadLinks template shell is missing on the server. Rebuild link v2 and copy out/** to app/server/assets/naadlink-shell.",
    })
  }

  // Empty = served at the (sub)domain root; assets become "/_next/..." etc.
  const replacement = input.basePath ?? ""
  const payload: NaadLinkPayload = JSON.parse(JSON.stringify(input.payload))
  const files: NaadLinkSiteFile[] = []

  for (const key of keys) {
    const relativePath = key.replace(/:/g, "/")

    // The dev-sample release.json ships in the shell; the per-release one is
    // appended below, so skip the shell copy to avoid a duplicate entry.
    if (relativePath === "release.json") {
      continue
    }

    const raw = (await storage.getItemRaw(key)) as Buffer | null

    if (!raw) {
      continue
    }

    let data: Buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as unknown as ArrayBuffer)

    if (TEXT_EXTENSIONS.has(extname(relativePath).toLowerCase())) {
      let text = data.toString("utf8").split(BASE_PLACEHOLDER).join(replacement)

      if (relativePath === "index.html" || relativePath.endsWith("/index.html")) {
        text = injectHeadMeta(text, {
          title: `${payload.track.title} — ${payload.artist.name}`,
          description: `Listen to ${payload.track.title} by ${payload.artist.name} on your favorite music streaming platform.`,
          imageUrl: input.ogImageUrl,
        })
      }

      data = Buffer.from(text, "utf8")
    }

    files.push({ name: relativePath, data })
  }

  if (input.coverBuffer) {
    files.push({ name: "cover.jpg", data: input.coverBuffer })
    payload.track = { ...payload.track, coverArt: "cover.jpg" }
  }

  files.push({ name: "release.json", data: Buffer.from(JSON.stringify(payload, null, 2), "utf8") })

  return files
}

export async function buildNaadLinkZip(input: BuildNaadLinkZipInput): Promise<Buffer> {
  const files = await buildNaadLinkFiles(input)

  const archive = archiver("zip", { zlib: { level: 9 } })
  const chunks: Buffer[] = []
  archive.on("data", (chunk: Buffer) => chunks.push(chunk))
  const finished = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)))
    archive.on("warning", (warning) => {
      if ((warning as { code?: string }).code !== "ENOENT") reject(warning)
    })
    archive.on("error", reject)
  })

  for (const file of files) {
    archive.append(file.data, { name: file.name })
  }

  await archive.finalize()
  return await finished
}
