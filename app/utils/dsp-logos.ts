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
const INSIDE_DSP_LOGO_FOLDER = "/insidedsp"

const SOURCES = {
  amazonAds: "https://m.media-amazon.com/images/G/01/AmazonMarketingServices/Amazon_Advertising_Marketing_Guidelines.pdf",
  amazonMusic: "https://artists.amazonmusic.com/brand-guidelines",
  amazonPrime: "https://press.aboutamazon.com/logos",
  anghami: "https://www.anghami.com/landing",
  appleMusic: "https://marketing.services.apple/apple-music-identity-guidelines",
  audiomack: "https://styleguide.audiomack.com/",
  beatport: "https://support.beatport.com/hc/en-us/articles/4412316336404-Beatport-Logos-and-Images",
  boomplay: "https://www.boomplay.com/",
  capcut: "https://www.capcut.com/",
  deezer: "https://deezerbrand.com/",
  facebook: "https://www.facebook.com/business/news/Brand-Resource-Center",
  iheartradio: "https://brand.iheart.com/logo",
  instagram: "https://about.instagram.com/brand",
  jiosaavn: "https://www.jiosaavn.com/",
  meta: "https://about.fb.com/news/2021/10/facebook-company-is-now-meta/",
  napster: "https://www.napster.com/us",
  pandora: "https://developer.pandora.com/docs/developer-resources/brand-assets/",
  peloton: "https://www.onepeloton.com/press",
  qobuz: "https://community.qobuz.com/press-en",
  shazam: "https://marketing.services.apple/apple-music-identity-guidelines",
  snapchat: "https://www.snap.com/brand-guidelines?lang=en-US",
  soundcloud: "https://community.soundcloud.com/company/media-kit",
  soundtrack: "https://www.soundtrack.io/press/",
  spotify: "https://newsroom.spotify.com/media-kit/logo-and-brand-assets/",
  tencent: "https://www.tencent.com/en-us/",
  tidal: "https://developer.tidal.com/documentation/guidelines/guidelines-design-guidelines",
  tiktok: "https://developers.tiktok.com/doc/getting-started-design-guidelines",
  trebel: "https://home.trebel.io/about-us",
  triller: "https://apps.apple.com/us/app/triller-social-videos-clips/id994905763",
  twitch: "https://brand.twitch.com/",
  youtube: "https://www.youtube.com/about/brand-resources/",
} as const

const DSP_BRAND_COLORS: Record<string, string> = {
  amazonAds: "#FF9900",
  amazonMusic: "#0DBFF5",
  amazonPrime: "#0DBFF5",
  amazonUnlimited: "#0DBFF5",
  anghami: "#7B3FE4",
  appleMusic: "#FF4E6B",
  audiomack: "#FFA200",
  beatport: "#01FF95",
  boomplay: "#00AEEF",
  capcut: "#00F5D4",
  deezer: "#A238FF",
  facebook: "#1877F2",
  iheart: "#C6002B",
  iheartradio: "#C6002B",
  instagram: "#E4405F",
  itunes: "#EA4CC0",
  jiosaavn: "#2BC5B4",
  kkbox: "#09CEF6",
  meta: "#0668E1",
  napster: "#00ADEF",
  pandora: "#005483",
  peloton: "#D12F32",
  qobuz: "#111111",
  resso: "#FF2D55",
  snapchat: "#FFFC00",
  shazam: "#0088FF",
  soundcloud: "#FF5500",
  soundtrackYourBrand: "#FF5C35",
  spotify: "#1ED760",
  tencent: "#0052D9",
  tidal: "#111111",
  tiktok: "#69C9D0",
  trebel: "#FDF203",
  triller: "#FF0050",
  twitch: "#9146FF",
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
  beatport: "#55DDA1",
  boomplay: "#42AFC9",
  capcut: "#5ACFC3",
  deezer: "#9A70D6",
  facebook: "#5B8FEA",
  iheart: "#D4535F",
  iheartradio: "#D4535F",
  instagram: "#D86A86",
  itunes: "#D86CAC",
  jiosaavn: "#4EB9A9",
  kkbox: "#4CBBD7",
  meta: "#5B8FEA",
  napster: "#48A9D2",
  pandora: "#3F7FA7",
  peloton: "#D76066",
  qobuz: "#A8A8A0",
  resso: "#DF607C",
  snapchat: "#D6C94A",
  shazam: "#4AA8F0",
  soundcloud: "#E07845",
  soundtrackYourBrand: "#D97855",
  spotify: "#45C976",
  tencent: "#5B8FEA",
  tidal: "#A8A8A0",
  tiktok: "#58C7CF",
  trebel: "#D6C94A",
  triller: "#DF607C",
  twitch: "#9A70D6",
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

function insideDspAssets(onLight: string, onDark = onLight): DspLogoAssets {
  return {
    onLight: `${INSIDE_DSP_LOGO_FOLDER}/${onLight}`,
    onDark: onDark ? `${INSIDE_DSP_LOGO_FOLDER}/${onDark}` : null,
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

const amazonMusicAssets = insideDspAssets("amazon-music-on-light.svg", "amazon-music-on-dark.svg")

export const DSP_LOGO_REGISTRY = [
  {
    key: "youtubeContentId",
    label: "YouTube Content ID",
    aliases: ["contentid", "youtubecontentid", "ytcontentid", "youtubeugccontentid"],
    assets: insideDspAssets("youtube-content-id-on-light.svg", "youtube-content-id-on-dark.svg"),
    source: "official",
    sourceUrl: SOURCES.youtube,
    kind: "wordmark",
  },
  {
    key: "youtubeMusic",
    label: "YouTube Music",
    aliases: ["youtube-music", "youtubemusic", "ytmusic", "ytmusicapp"],
    assets: insideDspAssets("youtube-music-on-light.png", "youtube-music-on-dark.png"),
    source: "official",
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
    aliases: ["amazon-ads", "amazon ads", "amazonads", "amazon-advertising", "amazon advertising", "amazonad", "amazon-dsp", "amazon dsp"],
    assets: insideDspAssets("amazon-ads-on-light.png", "amazon-ads-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.amazonAds,
    kind: "wordmark",
  },
  {
    key: "amazonPrime",
    label: "Amazon Prime",
    aliases: [
      "amazon-prime",
      "amazon prime",
      "amazonprime",
      "amazon-prime-video",
      "amazon prime video",
      "amazonprimevideo",
      "prime-video",
      "prime video",
      "primevideo",
      "amazonprimemusic",
      "primemusic",
      "amazonmusicprime",
    ],
    assets: insideDspAssets("amazon-prime-on-light.png", "amazon-prime-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.amazonPrime,
    kind: "wordmark",
  },
  {
    key: "amazonUnlimited",
    label: "Amazon Music Unlimited",
    aliases: ["amazon-unlimited", "amazonunlimited", "amazonmusicunlimited", "musicunlimited", "amu"],
    assets: amazonMusicAssets,
    source: "official",
    sourceUrl: SOURCES.amazonMusic,
    kind: "wordmark",
  },
  {
    key: "amazonMusic",
    label: "Amazon Music",
    aliases: ["amazon", "amazon-music", "amazonmusic", "amazonmp3"],
    assets: amazonMusicAssets,
    source: "official",
    sourceUrl: SOURCES.amazonMusic,
    kind: "wordmark",
  },
  {
    key: "appleMusic",
    label: "Apple Music",
    aliases: ["apple", "apple-music", "applemusic", "applemusicforartists"],
    assets: insideDspAssets("apple-music-on-light.png", "apple-music-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.appleMusic,
    kind: "wordmark",
  },
  {
    key: "spotify",
    label: "Spotify",
    aliases: ["spotify"],
    assets: insideDspAssets("spotify-on-light.png", "spotify-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.spotify,
    kind: "wordmark",
  },
  {
    key: "soundcloud",
    label: "SoundCloud",
    aliases: ["sound-cloud", "soundcloud"],
    assets: insideDspAssets("soundcloud-on-light.png", "soundcloud-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.soundcloud,
    kind: "wordmark",
    scale: 1.15,
  },
  {
    key: "instagram",
    label: "Instagram",
    aliases: ["ig", "instagram", "instagramreels", "instagram-reels"],
    assets: insideDspAssets("meta-on-light.png", "meta-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.meta,
    kind: "wordmark",
  },
  {
    key: "facebook",
    label: "Facebook",
    aliases: ["fb", "facebook", "facebookads", "facebook-ads"],
    assets: insideDspAssets("meta-on-light.png", "meta-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.meta,
    kind: "wordmark",
  },
  {
    key: "meta",
    label: "Meta",
    aliases: [
      "meta",
      "facebookinstagram",
      "instagramfacebook",
      "facebookandinstagram",
      "instagramandfacebook",
    ],
    assets: insideDspAssets("meta-on-light.png", "meta-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.meta,
    kind: "wordmark",
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
    aliases: ["tiktok", "tik-tok", "tik tok", "tiktokmusic"],
    assets: insideDspAssets("tiktok-on-light.png", "tiktok-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.tiktok,
    kind: "wordmark",
    scale: 1.45,
  },
  {
    key: "audiomack",
    label: "Audiomack",
    aliases: ["audio-mack", "audiomack"],
    assets: insideDspAssets("audiomack-on-light.svg", "audiomack-on-dark.svg"),
    source: "official",
    sourceUrl: SOURCES.audiomack,
    kind: "wordmark",
  },
  {
    key: "iheart",
    label: "iHeartRadio",
    aliases: ["iheart", "i-heart", "iheartradio", "iheart-radio"],
    assets: insideDspAssets("iheart-on-light.png", "iheart-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.iheartradio,
    kind: "wordmark",
    scale: 0.88,
  },
  {
    key: "capcut",
    label: "CapCut",
    aliases: ["capcut", "cap-cut", "cap cut"],
    assets: insideDspAssets("capcut-on-light.png", "capcut-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.capcut,
    kind: "wordmark",
  },
  {
    key: "boomplay",
    label: "Boomplay",
    aliases: ["boomplay"],
    assets: insideDspAssets("boomplay-on-light.png", "boomplay-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.boomplay,
    kind: "wordmark",
  },
  {
    key: "deezer",
    label: "Deezer",
    aliases: ["deezer"],
    assets: insideDspAssets("deezer-on-light.png", "deezer-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.deezer,
    kind: "wordmark",
  },
  {
    key: "tidal",
    label: "TIDAL",
    aliases: ["tidal"],
    assets: insideDspAssets("tidal-on-light.png", "tidal-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.tidal,
    kind: "wordmark",
  },
  {
    key: "anghami",
    label: "Anghami",
    aliases: ["anghami"],
    assets: insideDspAssets("anghami-on-light.png", "anghami-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.anghami,
    kind: "wordmark",
  },
  {
    key: "pandora",
    label: "Pandora",
    aliases: ["pandora"],
    assets: insideDspAssets("pandora-on-light.png", "pandora-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.pandora,
    kind: "wordmark",
  },
  {
    key: "napster",
    label: "Napster",
    aliases: ["napster"],
    assets: insideDspAssets("napster-on-light.png", "napster-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.napster,
    kind: "wordmark",
  },
  {
    key: "jiosaavn",
    label: "JioSaavn",
    aliases: ["jio-saavn", "jiosaavn", "saavn"],
    assets: insideDspAssets("jiosaavn-on-light.png", "jiosaavn-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.jiosaavn,
    kind: "wordmark",
  },
  {
    key: "shazam",
    label: "Shazam",
    aliases: ["shazam", "shazamkit"],
    assets: insideDspAssets("shazam-on-light.png", "shazam-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.shazam,
    kind: "icon",
  },
  {
    key: "beatport",
    label: "Beatport",
    aliases: ["beatport", "beat-port"],
    assets: insideDspAssets("beatport-on-light.png", "beatport-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.beatport,
    kind: "icon",
  },
  {
    key: "tencent",
    label: "Tencent",
    aliases: ["tencent"],
    assets: insideDspAssets("tencent-on-light.png", "tencent-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.tencent,
    kind: "wordmark",
    scale: 1.2,
  },
  {
    key: "triller",
    label: "Triller",
    aliases: ["triller", "trillerco", "triller-app"],
    assets: insideDspAssets("triller-on-light.png", "triller-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.triller,
    kind: "icon",
  },
  {
    key: "qobuz",
    label: "Qobuz",
    aliases: ["qobuz"],
    assets: insideDspAssets("qobuz-on-light.png", "qobuz-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.qobuz,
    kind: "wordmark",
  },
  {
    key: "twitch",
    label: "Twitch",
    aliases: ["twitch", "twitchtv", "twitch-tv"],
    assets: insideDspAssets("twitch-on-light.svg", "twitch-on-dark.svg"),
    source: "official",
    sourceUrl: SOURCES.twitch,
    kind: "wordmark",
  },
  {
    key: "peloton",
    label: "Peloton",
    aliases: ["peloton", "onepeloton"],
    assets: insideDspAssets("peloton-on-light.png", "peloton-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.peloton,
    kind: "icon",
  },
  {
    key: "trebel",
    label: "TREBEL",
    aliases: ["trebel", "trebelmusic", "trebel-music"],
    assets: insideDspAssets("trebel-on-light.png", "trebel-on-dark.png"),
    source: "official",
    sourceUrl: SOURCES.trebel,
    kind: "wordmark",
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
  if (normalized.includes("amazon") && (normalized.includes("ads") || normalized.includes("advertising") || normalized.includes("dsp"))) return byAlias("amazonads")
  if (normalized.includes("amazon") && normalized.includes("prime")) return byAlias("amazonprime")
  if (normalized.includes("amazon") && normalized.includes("unlimited")) return byAlias("amazonmusicunlimited")
  if (normalized.includes("amazonmusic") || normalized === "amazon") return byAlias("amazonmusic")
  if (normalized.includes("applemusic") || normalized === "apple") return byAlias("applemusic")
  if (normalized.includes("spotify")) return byAlias("spotify")
  if (normalized.includes("soundcloud")) return byAlias("soundcloud")
  if (normalized.includes("facebook") && normalized.includes("instagram")) return byAlias("meta")
  if (normalized.includes("instagram")) return byAlias("instagram")
  if (normalized.includes("facebook")) return byAlias("facebook")
  if (normalized.includes("meta")) return byAlias("meta")
  if (normalized.includes("snapchat") || normalized === "snap") return byAlias("snapchat")
  if (normalized.includes("soundtrack")) return byAlias("soundtrackyourbrand")
  if (normalized.includes("tiktok")) return byAlias("tiktok")
  if (normalized.includes("audiomack")) return byAlias("audiomack")
  if (normalized.includes("shazam")) return byAlias("shazam")
  if (normalized.includes("iheartradio") || normalized.includes("iheart")) return byAlias("iheart")
  if (normalized.includes("beatport")) return byAlias("beatport")
  if (normalized.includes("capcut")) return byAlias("capcut")
  if (normalized.includes("boomplay")) return byAlias("boomplay")
  if (normalized.includes("deezer")) return byAlias("deezer")
  if (normalized.includes("tidal")) return byAlias("tidal")
  if (normalized.includes("anghami")) return byAlias("anghami")
  if (normalized.includes("pandora")) return byAlias("pandora")
  if (normalized.includes("napster")) return byAlias("napster")
  if (normalized.includes("jiosaavn") || normalized.includes("saavn")) return byAlias("jiosaavn")
  if (normalized.includes("tencent")) return byAlias("tencent")
  if (normalized.includes("triller")) return byAlias("triller")
  if (normalized.includes("qobuz")) return byAlias("qobuz")
  if (normalized.includes("twitch")) return byAlias("twitch")
  if (normalized.includes("peloton")) return byAlias("peloton")
  if (normalized.includes("trebel")) return byAlias("trebel")
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
