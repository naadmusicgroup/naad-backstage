-- Subdomains are now per-ARTIST (one subdomain hosts all of an artist's release
-- pages: prabesh.naad.link/song-1, /song-2, …). Uniqueness lives in
-- naadlink_subdomains keyed by artist. So drop the old per-link unique index on
-- naad_links.subdomain — multiple links legitimately share the same subdomain.

drop index if exists public.idx_naad_links_subdomain;
