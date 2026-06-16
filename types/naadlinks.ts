/**
 * NaadLinks — types shared by the admin page, server routes, and the zip
 * generator. `NaadLinkPayload` is the exact shape written into each release's
 * `release.json` and consumed by the link v2 template at runtime.
 */

export interface NaadLinkCreditItem {
  name: string
  role?: string
}

export interface NaadLinkCreditSection {
  title: string
  items: NaadLinkCreditItem[]
}

export interface NaadLinkSocial {
  instagram?: string
  youtube?: string
  tiktok?: string
  facebook?: string
}

export interface NaadLinkStreamingLinks {
  spotify: string
  appleMusic: string
  youtubeMusic: string
  youtube: string
  tidal: string
  amazonMusic: string
  itunes: string
  deezer: string
  soundcloud: string
  audiomack: string
  anghami: string
  boomplay: string
  kkbox: string
  pandora: string
  iheart: string
  napster: string
  qobuz: string
  jiosaavn: string
  gaana: string
  wynk: string
  hungama: string
}

/** Mirrors link v2's `ReleaseData` — this is the release.json contract. */
export interface NaadLinkPayload {
  artist: { name: string; homeUrl: string }
  track: { title: string; releaseYear: string; coverArt: string; audioPreview: string }
  credits: { sections: NaadLinkCreditSection[] }
  social: NaadLinkSocial
  streamingLinks: NaadLinkStreamingLinks
}

export type NaadLinkDeployStatus = "idle" | "deploying" | "live" | "failed"

/** A saved link record (DB row, camelCased for the client). */
export interface NaadLinkRecord {
  id: string
  slug: string
  artistId: string | null
  releaseId: string | null
  trackId: string | null
  title: string
  artistName: string
  payload: NaadLinkPayload
  status: string
  /** cPanel subdomain label (e.g. "prabesh" → prabesh.naad.link). */
  subdomain: string | null
  /** Whether the subdomain's doc root was confirmed to exist over FTP. */
  subdomainVerified: boolean
  deployStatus: NaadLinkDeployStatus
  deployedAt: string | null
  deployError: string | null
  createdAt: string
  updatedAt: string
}

/** Root domain every NaadLink subdomain lives under. */
export const NAADLINK_ROOT_DOMAIN = "naad.link"

export interface NaadLinksListResponse {
  links: NaadLinkRecord[]
}

/** One track of a release, with the data the builder auto-fills from. */
export interface ReleaseTrackForLinks {
  id: string
  title: string
  audioPreviewUrl: string | null
  credits: NaadLinkCreditItem[]
}

/** One release in the artist's release picker, carrying auto-fill data. */
export interface ReleaseOptionForLinks {
  id: string
  title: string
  artistName: string
  coverArtUrl: string | null
  releaseDate: string | null
  tracks: ReleaseTrackForLinks[]
}

export interface ReleaseOptionsResponse {
  releases: ReleaseOptionForLinks[]
  social: NaadLinkSocial
}

export const NAADLINK_STREAMING_KEYS: Array<keyof NaadLinkStreamingLinks> = [
  "spotify", "appleMusic", "youtubeMusic", "youtube", "tidal", "amazonMusic", "itunes",
  "deezer", "soundcloud", "audiomack", "anghami", "boomplay", "kkbox", "pandora", "iheart",
  "napster", "qobuz", "jiosaavn", "gaana", "wynk", "hungama",
]

export function emptyStreamingLinks(): NaadLinkStreamingLinks {
  return {
    spotify: "", appleMusic: "", youtubeMusic: "", youtube: "", tidal: "", amazonMusic: "",
    itunes: "", deezer: "", soundcloud: "", audiomack: "", anghami: "", boomplay: "", kkbox: "",
    pandora: "", iheart: "", napster: "", qobuz: "", jiosaavn: "", gaana: "", wynk: "", hungama: "",
  }
}
