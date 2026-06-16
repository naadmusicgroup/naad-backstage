-- NaadLinks deployment: each link maps to a cPanel subdomain under naad.link
-- (e.g. "prabesh" -> prabesh.naad.link). The site is pushed straight into that
-- subdomain's document root via the cPanel API, so we persist the chosen
-- subdomain label plus the last deploy outcome for the admin UI.

alter table public.naad_links
  add column if not exists subdomain text,
  add column if not exists deployed_at timestamptz,
  add column if not exists deploy_status text not null default 'idle'
    check (deploy_status in ('idle', 'deploying', 'live', 'failed')),
  add column if not exists deploy_error text;

-- Subdomain label: lowercase letters, digits, hyphens (no dots/slashes). The
-- full host is always "<subdomain>.naad.link". Nullable until the admin sets it.
alter table public.naad_links
  drop constraint if exists naad_links_subdomain_format;
alter table public.naad_links
  add constraint naad_links_subdomain_format
  check (subdomain is null or subdomain ~ '^[a-z0-9-]+$');

-- One subdomain per link (and vice-versa); allow many NULLs.
create unique index if not exists idx_naad_links_subdomain
  on public.naad_links (subdomain)
  where subdomain is not null;
