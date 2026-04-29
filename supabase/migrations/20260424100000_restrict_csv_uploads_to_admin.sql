drop policy if exists csv_uploads_select on public.csv_uploads;

create policy csv_uploads_select on public.csv_uploads
for select
using (public.is_admin());
