create table if not exists public.company_bank_details (
  id uuid primary key default gen_random_uuid(),
  currency text not null unique check (currency in ('USD', 'NPR')),
  bank_name text not null,
  bank_address text,
  routing_aba text,
  swift_code text,
  account_number text not null,
  account_type text,
  account_name text,
  beneficiary_name text,
  branch_name text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists company_bank_details_set_updated_at on public.company_bank_details;
create trigger company_bank_details_set_updated_at
before update on public.company_bank_details
for each row execute function public.set_updated_at();

create index if not exists idx_company_bank_details_currency
  on public.company_bank_details (currency);

grant select, insert, update, delete on public.company_bank_details to authenticated, service_role;

alter table public.company_bank_details enable row level security;

drop policy if exists company_bank_details_admin_all on public.company_bank_details;
create policy company_bank_details_admin_all on public.company_bank_details
for all
using (public.is_admin())
with check (public.is_admin());

alter table public.company_bank_details force row level security;
