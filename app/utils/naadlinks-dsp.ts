import { emptyStreamingLinks, type NaadLinkStreamingLinks } from "~~/types/naadlinks"

/**
 * DSP link auto-detection. Paste a chunk of streaming URLs and each line is
 * matched to its platform by URL pattern. Ported from the original NaadLinks
 * builder; ORDER MATTERS — the more specific host wins (music.youtube before
 * youtube, music.apple before the itunes geo links).
 */
const PLATFORM_PATTERNS: Array<{ key: keyof NaadLinkStreamingLinks; pattern: RegExp }> = [
  { key: "spotify", pattern: /open\.spotify\.com|spotify\.com/i },
  { key: "youtubeMusic", pattern: /music\.youtube\.com/i },
  { key: "appleMusic", pattern: /music\.apple\.com/i },
  { key: "itunes", pattern: /itunes\.apple\.com|app=itunes/i },
  { key: "youtube", pattern: /youtube\.com|youtu\.be/i },
  { key: "tidal", pattern: /tidal\.com/i },
  { key: "amazonMusic", pattern: /music\.amazon\./i },
  { key: "deezer", pattern: /deezer\.com/i },
  { key: "soundcloud", pattern: /soundcloud\.com/i },
  { key: "audiomack", pattern: /audiomack\.com/i },
  { key: "anghami", pattern: /anghami\.com/i },
  { key: "boomplay", pattern: /boomplay\.com/i },
  { key: "kkbox", pattern: /kkbox\.com/i },
  { key: "pandora", pattern: /pandora\.com/i },
  { key: "iheart", pattern: /iheart\.com/i },
  { key: "napster", pattern: /napster\.com/i },
  { key: "qobuz", pattern: /qobuz\.com/i },
  { key: "jiosaavn", pattern: /jiosaavn\.com/i },
  { key: "gaana", pattern: /gaana\.com/i },
  { key: "wynk", pattern: /wynk\.in/i },
  { key: "hungama", pattern: /hungama\.com/i },
]

export interface DspDetectionResult {
  links: NaadLinkStreamingLinks
  detected: Array<{ key: keyof NaadLinkStreamingLinks; url: string }>
}

/**
 * Detect DSP links from pasted text. `existing` links are preserved unless a
 * pasted URL provides a value for an empty field (matches the original "fill
 * empty fields only" behavior).
 */
export function detectDspLinks(
  pastedText: string,
  existing?: Partial<NaadLinkStreamingLinks>,
): DspDetectionResult {
  const links: NaadLinkStreamingLinks = { ...emptyStreamingLinks(), ...(existing ?? {}) }
  const detected: DspDetectionResult["detected"] = []

  const lines = pastedText
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => /^https?:\/\//i.test(line))

  for (const url of lines) {
    for (const { key, pattern } of PLATFORM_PATTERNS) {
      if (pattern.test(url)) {
        if (!links[key]) {
          links[key] = url
          detected.push({ key, url })
        }
        break
      }
    }
  }

  return { links, detected }
}
