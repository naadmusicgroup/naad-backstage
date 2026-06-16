-- NaadLinks: remember once a subdomain's document root has been verified over
-- FTP, so the admin doesn't have to re-verify every time (it's an artist-level
-- fact — all of an artist's release pages live under the same subdomain).

alter table public.naad_links
  add column if not exists subdomain_verified boolean not null default false;
