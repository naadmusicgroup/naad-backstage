import {
  emptyStreamingLinks,
  NAADLINK_STREAMING_KEYS,
  type NaadLinkDeployStatus,
  type NaadLinkPayload,
  type NaadLinkRecord,
  type NaadLinkSocial,
} from "~~/types/naadlinks"

/** Columns every NaadLink query should select (keeps row shape consistent). */
export const NAAD_LINK_COLUMNS =
  "id, slug, artist_id, release_id, track_id, title, artist_name, payload, status, subdomain, subdomain_verified, deployed_at, deploy_status, deploy_error, created_at, updated_at"

interface NaadLinkRow {
  id: string
  slug: string
  artist_id: string | null
  release_id: string | null
  track_id: string | null
  title: string | null
  artist_name: string | null
  payload: unknown
  status: string
  subdomain?: string | null
  subdomain_verified?: boolean | null
  deployed_at?: string | null
  deploy_status?: string | null
  deploy_error?: string | null
  created_at: string
  updated_at: string
}

const DEPLOY_STATUSES: NaadLinkDeployStatus[] = ["idle", "deploying", "live", "failed"]

export function mapNaadLinkRow(row: NaadLinkRow): NaadLinkRecord {
  const deployStatus = (row.deploy_status ?? "idle") as NaadLinkDeployStatus
  return {
    id: row.id,
    slug: row.slug,
    artistId: row.artist_id,
    releaseId: row.release_id,
    trackId: row.track_id,
    title: row.title ?? "",
    artistName: row.artist_name ?? "",
    payload: sanitizeNaadLinkPayload(row.payload),
    status: row.status,
    subdomain: row.subdomain ?? null,
    subdomainVerified: row.subdomain_verified ?? false,
    deployStatus: DEPLOY_STATUSES.includes(deployStatus) ? deployStatus : "idle",
    deployedAt: row.deployed_at ?? null,
    deployError: row.deploy_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** cPanel-safe subdomain label: lowercase letters, digits, hyphens. */
export function normalizeSubdomain(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9.-]*$/i, "") // strip any ".naad.link" the user pasted
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
}

/** cPanel-safe slug: lowercase, hyphenated, no leading slash. */
export function normalizeSlug(input: unknown): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/** Coerce arbitrary input into a complete, safe NaadLinkPayload. */
export function sanitizeNaadLinkPayload(raw: unknown): NaadLinkPayload {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>
  const artist = (source.artist ?? {}) as Record<string, any>
  const track = (source.track ?? {}) as Record<string, any>
  const credits = (source.credits ?? {}) as Record<string, any>
  const social = (source.social ?? {}) as Record<string, any>
  const links = (source.streamingLinks ?? {}) as Record<string, any>

  const sections = Array.isArray(credits.sections)
    ? credits.sections
        .map((section: any) => ({
          title: asString(section?.title),
          items: Array.isArray(section?.items)
            ? section.items
                .map((item: any) => ({ name: asString(item?.name), role: asString(item?.role) || undefined }))
                .filter((item: any) => item.name)
            : [],
        }))
        .filter((section: any) => section.title && section.items.length)
    : []

  const streamingLinks = emptyStreamingLinks()
  for (const key of NAADLINK_STREAMING_KEYS) {
    streamingLinks[key] = asString(links[key]).trim()
  }

  const socialOut: NaadLinkSocial = {}
  for (const key of ["instagram", "youtube", "tiktok", "facebook"] as const) {
    const value = asString(social[key]).trim()
    if (value) socialOut[key] = value
  }

  return {
    artist: { name: asString(artist.name).trim(), homeUrl: asString(artist.homeUrl).trim() },
    track: {
      title: asString(track.title).trim(),
      releaseYear: asString(track.releaseYear).trim(),
      coverArt: asString(track.coverArt).trim(),
      audioPreview: asString(track.audioPreview).trim(),
    },
    credits: { sections },
    social: socialOut,
    streamingLinks,
  }
}
