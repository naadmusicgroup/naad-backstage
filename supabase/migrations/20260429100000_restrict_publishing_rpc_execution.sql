revoke all on function public.ensure_open_statement_period(uuid, date) from public, anon, authenticated;
revoke all on function public.create_publishing_earning(uuid, uuid, numeric, date, text, uuid) from public, anon, authenticated;
revoke all on function public.update_publishing_earning(uuid, uuid, numeric, date, text, uuid) from public, anon, authenticated;
revoke all on function public.delete_publishing_earning(uuid, uuid) from public, anon, authenticated;

grant execute on function public.ensure_open_statement_period(uuid, date) to service_role;
grant execute on function public.create_publishing_earning(uuid, uuid, numeric, date, text, uuid) to service_role;
grant execute on function public.update_publishing_earning(uuid, uuid, numeric, date, text, uuid) to service_role;
grant execute on function public.delete_publishing_earning(uuid, uuid) to service_role;
