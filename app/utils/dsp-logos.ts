export interface DspLogoAssets {
  onLight: string
  onDark?: string | null
}

export type DspLogoSource = "official" | "not_found"
export type DspLogoKind = "wordmark" | "icon"

export interface DspLogoMeta {
  key: string
  label: string
  aliases: string[]
  assets: DspLogoAssets | null
  source: DspLogoSource
  sourceUrl?: string
  kind?: DspLogoKind
  scale?: number
}

const DSP_LOGO_FOLDER = "/dsp-logos/official"

const SOURCES = {
  amazonAds: "https://advertising.amazon.com/en-us/resources/ad-policy/brand-usage",
  amazonMusic: "https://artists.amazonmusic.com/brand-guidelines",
  appleMusic: "https://marketing.services.apple/apple-music-identity-guidelines",
  audiomack: "https://styleguide.audiomack.com/",
  capcut: "https://www.capcut.com/",
  deezer: "https://newsroom-deezer.com/2023/11/deezer-new-brand-identity-and-logo/",
  iheartradio: "https://brand.iheart.com/logo",
  meta: "https://about.fb.com/news/2021/10/facebook-company-is-now-meta/",
  snapchat: "https://www.snap.com/brand-guidelines?lang=en-US",
  soundcloud: "https://soundcloud.com/company/media-kit",
  soundtrack: "https://www.soundtrack.io/press/",
  spotify: "https://newsroom.spotify.com/media-kit/logo-and-brand-assets/",
  tidal: "https://developer.tidal.com/documentation/guidelines/guidelines-design-guidelines",
  tiktok: "https://developers.tiktok.com/doc/getting-started-design-guidelines",
  youtube: "https://www.youtube.com/howyoutubeworks/resources/brand-resources/",
} as const

const DSP_BRAND_COLORS: Record<string, string> = {
  amazonAds: "#FF9900",
  amazonMusic: "#0DBFF5",
  amazonPrime: "#0DBFF5",
  amazonUnlimited: "#0DBFF5",
  anghami: "#7B3FE4",
  appleMusic: "#FF4E6B",
  audiomack: "#FFA200",
  boomplay: "#00AEEF",
  capcut: "#00F5D4",
  deezer: "#A238FF",
  iheartradio: "#C6002B",
  itunes: "#EA4CC0",
  jiosaavn: "#2BC5B4",
  kkbox: "#09CEF6",
  meta: "#0668E1",
  napster: "#00ADEF",
  pandora: "#005483",
  resso: "#FF2D55",
  snapchat: "#FFFC00",
  soundcloud: "#FF5500",
  soundtrackYourBrand: "#FF5C35",
  spotify: "#1ED760",
  tidal: "#111111",
  tiktok: "#69C9D0",
  wynk: "#E31B23",
  youtube: "#FF0000",
  youtubeContentId: "#FF0000",
  youtubeMusic: "#FF0000",
}

const DSP_CHART_COLORS: Record<string, string> = {
  amazonAds: "#D89A3D",
  amazonMusic: "#44BFD1",
  amazonPrime: "#44BFD1",
  amazonUnlimited: "#44BFD1",
  anghami: "#8C68D8",
  appleMusic: "#E85D75",
  audiomack: "#D99A37",
  boomplay: "#42AFC9",
  capcut: "#5ACFC3",
  deezer: "#9A70D6",
  iheartradio: "#D4535F",
  itunes: "#D86CAC",
  jiosaavn: "#4EB9A9",
  kkbox: "#4CBBD7",
  meta: "#5B8FEA",
  napster: "#48A9D2",
  pandora: "#3F7FA7",
  resso: "#DF607C",
  snapchat: "#D6C94A",
  soundcloud: "#E07845",
  soundtrackYourBrand: "#D97855",
  spotify: "#45C976",
  tidal: "#A8A8A0",
  tiktok: "#58C7CF",
  wynk: "#D85A5D",
  youtube: "#E14D4D",
  youtubeContentId: "#E14D4D",
  youtubeMusic: "#E14D4D",
}

function officialAssets(onLight: string, onDark = onLight): DspLogoAssets {
  return {
    onLight: `${DSP_LOGO_FOLDER}/${onLight}`,
    onDark: onDark ? `${DSP_LOGO_FOLDER}/${onDark}` : null,
  }
}

function lightOnlyOfficialAssets(onLight: string): DspLogoAssets {
  return {
    onLight: `${DSP_LOGO_FOLDER}/${onLight}`,
    onDark: null,
  }
}

function publicAssets(path: string): DspLogoAssets {
  return {
    onLight: path,
    onDark: path,
  }
}

const amazonMusicAssets = officialAssets("amazon-music-on-light.svg", "amazon-music-on-dark.svg")

export const DSP_LOGO_REGISTRY = [
  {
    key: "youtubeContentId",
    label: "YouTube Content ID",
    aliases: ["contentid", "youtubecontentid", "ytcontentid", "youtubeugccontentid"],
    assets: officialAssets("youtube-on-light.png", "youtube-on-dark.png"),
    source: "not_found",
    sourceUrl: SOURCES.youtube,
    kind: "wordmark",
    scale: 0.9,
  },
  {
    key: "youtubeMusic",
    label: "YouTube Music",
    aliases: ["youtubemusic", "ytmusic", "ytmusicapp"],
    assets: publicAssets("/dsp%20logo/youtubeMusic.png"),
    source: "not_found",
    sourceUrl: SOURCES.youtube,
    kind: "wordmark",
  },
  {
    key: "youtube",
    label: "YouTube",
    aliases: ["youtube", "yt"],
    assets: officialAssets("youtube-on-light.png", "youtube-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.youtube,
    kind: "wordmark",
    scale: 0.9,
  },
  {
    key: "amazonAds",
    label: "Amazon Ads",
    aliases: ["amazonads", "amazonadvertising", "amazonad"],
    assets: null,
    source: "not_found",
    sourceUrl: SOURCES.amazonAds,
  },
  {
    key: "amazonPrime",
    label: "Amazon Prime",
    aliases: ["amazonprime", "amazonprimemusic", "primemusic", "amazonmusicprime"],
    assets: null,
    source: "not_found",
    sourceUrl: SOURCES.amazonMusic,
  },
  {
    key: "amazonUnlimited",
    label: "Amazon Music Unlimited",
    aliases: ["amazonunlimited", "amazonmusicunlimited", "musicunlimited", "amu"],
    assets: amazonMusicAssets,
    source: "official",
    sourceUrl: SOURCES.amazonMusic,
    kind: "wordmark",
  },
  {
    key: "amazonMusic",
    label: "Amazon Music",
    aliases: ["amazon", "amazonmusic", "amazonmp3"],
    assets: amazonMusicAssets,
    source: "official",
    sourceUrl: SOURCES.amazonMusic,
    kind: "wordmark",
  },
  {
    key: "appleMusic",
    label: "Apple Music",
    aliases: ["apple", "applemusic", "applemusicforartists"],
    assets: publicAssets("/dsp%20logo/appleMusic.png"),
    source: "not_found",
    sourceUrl: SOURCES.appleMusic,
    kind: "wordmark",
  },
  {
    key: "spotify",
    label: "Spotify",
    aliases: ["spotify"],
    assets: officialAssets("spotify-on-light.png", "spotify-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.spotify,
    kind: "wordmark",
  },
  {
    key: "soundcloud",
    label: "SoundCloud",
    aliases: ["soundcloud"],
    assets: officialAssets("soundcloud-on-light.png", "soundcloud-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.soundcloud,
    kind: "wordmark",
    scale: 1.15,
  },
  {
    key: "meta",
    label: "Meta",
    aliases: [
      "meta",
      "facebook",
      "instagram",
      "facebookinstagram",
      "instagramfacebook",
      "facebookandinstagram",
      "instagramandfacebook",
      "facebookads",
      "instagramreels",
    ],
    assets: lightOnlyOfficialAssets("meta.png"),
    source: "official",
    sourceUrl: SOURCES.meta,
    kind: "wordmark",
    scale: 1.85,
  },
  {
    key: "snapchat",
    label: "Snapchat",
    aliases: ["snap", "snapchat"],
    assets: officialAssets("snapchat-lockup-on-light.svg", "snapchat-lockup-on-dark.svg"),
    source: "official",
    sourceUrl: SOURCES.snapchat,
    kind: "wordmark",
    scale: 0.92,
  },
  {
    key: "soundtrackYourBrand",
    label: "Soundtrack Your Brand",
    aliases: ["soundtrack", "soundtrackyourbrand", "soundtrackio", "soundtrackbusiness"],
    assets: officialAssets("soundtrack-on-light.svg", "soundtrack-on-dark.svg"),
    source: "official",
    sourceUrl: SOURCES.soundtrack,
    kind: "wordmark",
  },
  {
    key: "tiktok",
    label: "TikTok",
    aliases: ["tiktok", "tik tok", "tiktokmusic"],
    assets: officialAssets("tiktok-on-light.png", "tiktok-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.tiktok,
    kind: "wordmark",
    scale: 1.45,
  },
  {
    key: "audiomack",
    label: "Audiomack",
    aliases: ["audiomack"],
    assets: officialAssets("audiomack-on-light.svg", "audiomack-on-dark.svg"),
    source: "official",
    sourceUrl: SOURCES.audiomack,
    kind: "wordmark",
  },
  {
    key: "iheartradio",
    label: "iHeartRadio",
    aliases: ["iheartradio", "iheart"],
    assets: officialAssets("iheartradio-on-light.png", "iheartradio-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.iheartradio,
    kind: "wordmark",
    scale: 0.88,
  },
  {
    key: "capcut",
    label: "CapCut",
    aliases: ["capcut", "cap cut"],
    assets: null,
    source: "not_found",
    sourceUrl: SOURCES.capcut,
  },
  {
    key: "boomplay",
    label: "Boomplay",
    aliases: ["boomplay"],
    assets: null,
    source: "not_found",
  },
  {
    key: "deezer",
    label: "Deezer",
    aliases: ["deezer"],
    assets: null,
    source: "not_found",
    sourceUrl: SOURCES.deezer,
  },
  {
    key: "tidal",
    label: "TIDAL",
    aliases: ["tidal"],
    assets: null,
    source: "not_found",
    sourceUrl: SOURCES.tidal,
  },
  {
    key: "anghami",
    label: "Anghami",
    aliases: ["anghami"],
    assets: null,
    source: "not_found",
  },
  {
    key: "pandora",
    label: "Pandora",
    aliases: ["pandora"],
    assets: null,
    source: "not_found",
  },
  {
    key: "napster",
    label: "Napster",
    aliases: ["napster"],
    assets: null,
    source: "not_found",
  },
  {
    key: "jiosaavn",
    label: "JioSaavn",
    aliases: ["jiosaavn", "saavn"],
    assets: null,
    source: "not_found",
  },
  {
    key: "itunes",
    label: "iTunes",
    aliases: ["itunes", "itunesstore"],
    assets: null,
    source: "not_found",
  },
  {
    key: "kkbox",
    label: "KKBOX",
    aliases: ["kkbox"],
    assets: null,
    source: "not_found",
  },
  {
    key: "resso",
    label: "Resso",
    aliases: ["resso"],
    assets: null,
    source: "not_found",
  },
  {
    key: "wynk",
    label: "Wynk",
    aliases: ["wynk", "wynkmusic"],
    assets: null,
    source: "not_found",
  },
] as const satisfies readonly DspLogoMeta[]

export type DspLogoKey = (typeof DSP_LOGO_REGISTRY)[number]["key"]

const registryByKey = new Map<string, DspLogoMeta>(
  DSP_LOGO_REGISTRY.map((entry) => [entry.key.toLowerCase(), entry]),
)

const aliasLookup = new Map<string, DspLogoMeta>()

for (const entry of DSP_LOGO_REGISTRY) {
  aliasLookup.set(normalizeDspLookup(entry.key), entry)
  aliasLookup.set(normalizeDspLookup(entry.label), entry)

  for (const alias of entry.aliases) {
    aliasLookup.set(normalizeDspLookup(alias), entry)
  }
}

export function normalizeDspLookup(value: string | null | undefined) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")
}

function byAlias(alias: string) {
  return aliasLookup.get(alias) ?? null
}

export function resolveDspLogo(value: string | null | undefined) {
  const normalized = normalizeDspLookup(value)

  if (!normalized) {
    return null
  }

  const direct = registryByKey.get(String(value).toLowerCase()) ?? aliasLookup.get(normalized)

  if (direct) {
    return direct
  }

  if (normalized.includes("contentid")) return byAlias("youtubecontentid")
  if (normalized.includes("youtube") && normalized.includes("music")) return byAlias("youtubemusic")
  if (normalized.includes("youtube") || normalized === "yt") return byAlias("youtube")
  if (normalized.includes("amazon") && (normalized.includes("ads") || normalized.includes("advertising"))) return byAlias("amazonads")
  if (normalized.includes("amazon") && normalized.includes("prime")) return byAlias("amazonprime")
  if (normalized.includes("amazon") && normalized.includes("unlimited")) return byAlias("amazonmusicunlimited")
  if (normalized.includes("amazonmusic") || normalized === "amazon") return byAlias("amazonmusic")
  if (normalized.includes("applemusic") || normalized === "apple") return byAlias("applemusic")
  if (normalized.includes("spotify")) return byAlias("spotify")
  if (normalized.includes("soundcloud")) return byAlias("soundcloud")
  if (normalized.includes("facebook") || normalized.includes("instagram") || normalized.includes("meta")) return byAlias("meta")
  if (normalized.includes("snapchat") || normalized === "snap") return byAlias("snapchat")
  if (normalized.includes("soundtrack")) return byAlias("soundtrackyourbrand")
  if (normalized.includes("tiktok")) return byAlias("tiktok")
  if (normalized.includes("audiomack")) return byAlias("audiomack")
  if (normalized.includes("iheartradio") || normalized.includes("iheart")) return byAlias("iheartradio")
  if (normalized.includes("capcut")) return byAlias("capcut")
  if (normalized.includes("boomplay")) return byAlias("boomplay")
  if (normalized.includes("deezer")) return byAlias("deezer")
  if (normalized.includes("tidal")) return byAlias("tidal")
  if (normalized.includes("anghami")) return byAlias("anghami")
  if (normalized.includes("pandora")) return byAlias("pandora")
  if (normalized.includes("napster")) return byAlias("napster")
  if (normalized.includes("jiosaavn") || normalized.includes("saavn")) return byAlias("jiosaavn")
  if (normalized.includes("itunes")) return byAlias("itunes")
  if (normalized.includes("kkbox")) return byAlias("kkbox")
  if (normalized.includes("resso")) return byAlias("resso")
  if (normalized.includes("wynk")) return byAlias("wynk")

  return null
}

export function resolveDspBrandColor(value: string | null | undefined, fallback: string | null = null) {
  const logo = resolveDspLogo(value)

  return logo ? DSP_BRAND_COLORS[logo.key] ?? fallback : fallback
}

export function resolveDspChartColor(value: string | null | undefined, fallback: string | null = null) {
  const logo = resolveDspLogo(value)

  return logo ? DSP_CHART_COLORS[logo.key] ?? DSP_BRAND_COLORS[logo.key] ?? fallback : fallback
}

export function dspLogoKeyForName(value: string | null | undefined) {
  return resolveDspLogo(value)?.key ?? null
}

export function dspLabelFor(value: string | null | undefined, fallback = "Platform") {
  return resolveDspLogo(value)?.label || String(value ?? "").trim() || fallback
}
