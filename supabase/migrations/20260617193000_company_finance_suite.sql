create table if not exists public.company_transactions (
  id uuid primary key default gen_random_uuid(),
  currency text not null check (currency in ('USD', 'NPR')),
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  transaction_date date not null,
  name text not null,
  amount numeric(18,8) not null check (amount > 0),
  category text not null,
  vendor_payee text,
  payment_method text not null default 'bank_transfer' check (payment_method in ('bank_transfer', 'cash', 'card', 'online_wallet', 'cheque', 'other')),
  reference_number text,
  status text not null default 'recorded' check (status in ('recorded', 'pending', 'reconciled', 'flagged')),
  note text,
  created_by uuid references public.profiles (id) on delete restrict,
  updated_by uuid references public.profiles (id) on delete set null,
  deleted_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_transaction_attachments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.company_transactions (id) on delete cascade,
  uploaded_by uuid references public.profiles (id) on delete set null,
  filename text not null,
  content_type text,
  file_size bigint not null check (file_size > 0),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

drop trigger if exists company_transactions_set_updated_at on public.company_transactions;
create trigger company_transactions_set_updated_at
before update on public.company_transactions
for each row execute function public.set_updated_at();

create index if not exists idx_company_transactions_currency_date
  on public.company_transactions (currency, transaction_date desc, id desc)
  where deleted_at is null;

create index if not exists idx_company_transactions_type_status
  on public.company_transactions (currency, transaction_type, status)
  where deleted_at is null;

create index if not exists idx_company_transaction_attachments_transaction
  on public.company_transaction_attachments (transaction_id, created_at desc);

grant select, insert, update, delete on public.company_transactions to authenticated, service_role;
grant select, insert, update, delete on public.company_transaction_attachments to authenticated, service_role;

alter table public.company_transactions enable row level security;
alter table public.company_transaction_attachments enable row level security;

drop policy if exists company_transactions_admin_all on public.company_transactions;
create policy company_transactions_admin_all on public.company_transactions
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists company_transaction_attachments_admin_all on public.company_transaction_attachments;
create policy company_transaction_attachments_admin_all on public.company_transaction_attachments
for all
using (
  public.is_admin()
  and exists (
    select 1
    from public.company_transactions company_transaction
    where company_transaction.id = company_transaction_attachments.transaction_id
      and company_transaction.deleted_at is null
  )
)
with check (
  public.is_admin()
  and exists (
    select 1
    from public.company_transactions company_transaction
    where company_transaction.id = company_transaction_attachments.transaction_id
      and company_transaction.deleted_at is null
  )
);

alter table public.company_transactions force row level security;
alter table public.company_transaction_attachments force row level security;
