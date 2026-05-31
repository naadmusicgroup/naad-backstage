const EXCLUDED_REGION_CODES = new Set(["AA", "QM", "QO", "QU", "QZ", "WW", "XX", "ZZ"])
const FALLBACK_FLAG_CODES = new Set(["EU", "UN", "XK"])
const FLAG_CDN_BASE_URL = "https://flagcdn.com"

const regionDisplayNames = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null

const countryCodeByLookupName = new Map<string, string>()

const COUNTRY_CODE_ALIASES: Record<string, string> = {
  UAE: "AE",
  UK: "GB",
  USA: "US",
  GBR: "GB",
  EL: "GR",
  NPL: "NP",
  XKS: "XK",
}

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  "aland": "AX",
  "aland islands": "AX",
  "bolivia": "BO",
  "bosnia herzegovina": "BA",
  "bosnia and herzegovina": "BA",
  "brunei": "BN",
  "burma": "MM",
  "cape verde": "CV",
  "czech republic": "CZ",
  "czechia": "CZ",
  "democratic republic of congo": "CD",
  "democratic republic of the congo": "CD",
  "dr congo": "CD",
  "drc": "CD",
  "congo kinshasa": "CD",
  "congo brazzaville": "CG",
  "east timor": "TL",
  "eswatini": "SZ",
  "great britain": "GB",
  "hong kong": "HK",
  "iran": "IR",
  "ivory coast": "CI",
  "cote divoire": "CI",
  "cote d ivoire": "CI",
  "kosovo": "XK",
  "laos": "LA",
  "macau": "MO",
  "macao": "MO",
  "macedonia": "MK",
  "moldova": "MD",
  "myanmar": "MM",
  "north korea": "KP",
  "palestine": "PS",
  "republic of korea": "KR",
  "russia": "RU",
  "russian federation": "RU",
  "south korea": "KR",
  "swaziland": "SZ",
  "syria": "SY",
  "taiwan": "TW",
  "tanzania": "TZ",
  "the united kingdom": "GB",
  "the united states": "US",
  "u s": "US",
  "u s a": "US",
  "uae": "AE",
  "uk": "GB",
  "united arab emirates": "AE",
  "united kingdom": "GB",
  "united states": "US",
  "united states of america": "US",
  "usa": "US",
  "vatican": "VA",
  "venezuela": "VE",
  "vietnam": "VN",
}

for (let first = 65; first <= 90; first += 1) {
  for (let second = 65; second <= 90; second += 1) {
    const code = `${String.fromCharCode(first)}${String.fromCharCode(second)}`

    if (!isDisplayableRegionCode(code)) {
      continue
    }

    const name = displayNameForRegionCode(code)

    countryCodeByLookupName.set(lookupKey(name), code)
  }
}

countryCodeByLookupName.set("kosovo", "XK")
countryCodeByLookupName.set("european union", "EU")

for (const [name, code] of Object.entries(COUNTRY_NAME_ALIASES)) {
  countryCodeByLookupName.set(name, code)
}

export function countryCodeFor(value: string | null | undefined) {
  const text = String(value ?? "").trim()

  if (!text) {
    return null
  }

  const upper = text.toUpperCase()
  const aliasedCode = COUNTRY_CODE_ALIASES[upper] ?? upper

  if (/^[A-Z]{2}$/.test(aliasedCode) && isDisplayableRegionCode(aliasedCode)) {
    return aliasedCode
  }

  if (/^[A-Z]{3}$/.test(aliasedCode) && COUNTRY_CODE_ALIASES[aliasedCode]) {
    return COUNTRY_CODE_ALIASES[aliasedCode]
  }

  return countryCodeByLookupName.get(lookupKey(text)) ?? null
}

export function countryFlagUrlFor(value: string | null | undefined) {
  const code = countryCodeFor(value)

  if (!code) {
    return ""
  }

  return `${FLAG_CDN_BASE_URL}/${code.toLowerCase()}.svg`
}

export function countryNameFor(value: string | null | undefined, fallback = "Unknown country") {
  const text = String(value ?? "").trim()
  const code = countryCodeFor(text)

  if (code) {
    const fallbackText = String(fallback ?? "").trim()

    if (fallbackText && !looksLikeCountryCode(fallbackText) && countryCodeFor(fallbackText) === code) {
      return fallbackText
    }

    return displayNameForRegionCode(code)
  }

  return text || fallback
}

function displayNameForRegionCode(code: string) {
  if (code === "XK") {
    return "Kosovo"
  }

  try {
    return regionDisplayNames?.of(code) ?? code
  } catch {
    return code
  }
}

function isDisplayableRegionCode(code: string) {
  if (!/^[A-Z]{2}$/.test(code) || EXCLUDED_REGION_CODES.has(code)) {
    return false
  }

  if (FALLBACK_FLAG_CODES.has(code)) {
    return true
  }

  const name = displayNameForRegionCode(code)
  return Boolean(name && name !== code && name !== "Unknown Region")
}

function lookupKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
}

function looksLikeCountryCode(value: string) {
  return /^[a-zA-Z]{2,3}$/.test(value.trim())
}
