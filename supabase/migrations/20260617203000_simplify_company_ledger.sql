drop index if exists public.idx_company_transactions_bank_account_date;

alter table if exists public.company_transactions
  drop constraint if exists company_transactions_bank_account_id_fkey;

alter table if exists public.company_transactions
  drop column if exists bank_account_id;

drop table if exists public.company_bank_accounts cascade;
