-- Restrict the internal OfferPSP control bridge to its single Google owner.
-- Client authentication remains unchanged because it does not use is_offerpsp_staff().

update public.offerpsp_staff_members staff
set active = false,
    updated_at = now()
from auth.users users
where staff.user_id = users.id
  and lower(users.email) <> 'guannko@gmail.com'
  and staff.active = true;

create or replace function public.is_offerpsp_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'guannko@gmail.com'
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'google'
    and exists (
      select 1
      from public.offerpsp_staff_members
      where user_id = auth.uid()
        and active = true
    );
$$;

revoke all on function public.is_offerpsp_staff() from public;
revoke execute on function public.is_offerpsp_staff() from anon;
grant execute on function public.is_offerpsp_staff() to authenticated;

comment on function public.is_offerpsp_staff() is
  'Allows internal OfferPSP operations only for the active Google owner guannko@gmail.com.';
