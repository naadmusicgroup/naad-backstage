import { deleteCookie, getCookie, setCookie, type H3Event } from "h3"

export const VIEW_AS_ARTIST_COOKIE = "naad-view-as-artist-id"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidViewAsArtistId(value: string | null | undefined) {
  return UUID_PATTERN.test(String(value ?? "").trim())
}

export function getViewAsArtistId(event: H3Event) {
  const artistId = String(getCookie(event, VIEW_AS_ARTIST_COOKIE) ?? "").trim()
  return isValidViewAsArtistId(artistId) ? artistId : ""
}

export function setViewAsArtistCookie(event: H3Event, artistId: string) {
  setCookie(event, VIEW_AS_ARTIST_COOKIE, artistId, {
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export function clearViewAsArtistCookie(event: H3Event) {
  deleteCookie(event, VIEW_AS_ARTIST_COOKIE, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}
