import type { NaadLinkCreditItem, NaadLinkCreditSection } from "~~/types/naadlinks"

export interface RawCredit {
  name: string
  role?: string
}

const SECTION_ORDER = [
  "Songwriting & Composition",
  "Production & Engineering",
  "Performers",
  "Other Roles",
] as const

function sectionForRole(role: string): (typeof SECTION_ORDER)[number] {
  const value = role.toLowerCase()

  if (/(compos|lyric|songwrit|writer|wrote|arrang|author)/.test(value)) {
    return "Songwriting & Composition"
  }
  if (/(produc|engineer|mix|master|record|mastering|mixing)/.test(value)) {
    return "Production & Engineering"
  }
  if (/(artist|vocal|singer|guitar|bass|drum|piano|keyboard|violin|cello|sax|flute|percussion|musician|performer|\bdj\b|instrument)/.test(value)) {
    return "Performers"
  }
  return "Other Roles"
}

/**
 * Group a track's flat credits into the link page's credit sections, then
 * append the fixed "Sources" section. Names are de-duplicated within a
 * section (roles merged with " • ").
 */
export function groupCreditsIntoSections(credits: RawCredit[]): NaadLinkCreditSection[] {
  const buckets = new Map<string, Map<string, Set<string>>>()

  for (const credit of credits) {
    const name = (credit.name ?? "").trim()
    if (!name) continue

    const role = (credit.role ?? "").trim()
    const section = sectionForRole(role)

    const byName = buckets.get(section) ?? new Map<string, Set<string>>()
    const roles = byName.get(name) ?? new Set<string>()
    if (role) roles.add(role)
    byName.set(name, roles)
    buckets.set(section, byName)
  }

  const sections: NaadLinkCreditSection[] = []

  for (const title of SECTION_ORDER) {
    const byName = buckets.get(title)
    if (!byName || !byName.size) continue

    const items: NaadLinkCreditItem[] = [...byName.entries()].map(([name, roles]) => ({
      name,
      role: roles.size ? [...roles].join(" • ") : undefined,
    }))
    sections.push({ title, items })
  }

  sections.push({ title: "Sources", items: [{ name: "Naad Music Group", role: "Source" }] })

  return sections
}
