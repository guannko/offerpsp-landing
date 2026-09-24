alter table public.offerpsp_shortlist_items
  add column if not exists public_code text;

update public.offerpsp_shortlist_items
set public_code = 'OP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where public_code is null;

alter table public.offerpsp_shortlist_items
  alter column public_code set default (
    'OP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  alter column public_code set not null;

create unique index if not exists offerpsp_shortlist_items_public_code_key
  on public.offerpsp_shortlist_items (public_code);

drop policy if exists offerpsp_matches_client_read
  on public.offerpsp_matches;

drop policy if exists offerpsp_shortlist_items_client_read
  on public.offerpsp_shortlist_items;

drop view if exists public.offerpsp_client_shortlist;

create view public.offerpsp_client_shortlist
with (security_barrier = true)
as
select
  s.id as shortlist_id,
  s.lead_id,
  s.version,
  s.title,
  s.introduction,
  s.status,
  s.shared_at,
  si.rank,
  si.public_code as option_code,
  coalesce(
    nullif(si.client_note, ''),
    'Selected for your operating profile. Detailed partner terms are disclosed during the managed introduction.'
  ) as client_note
from public.offerpsp_shortlists s
join public.offerpsp_shortlist_items si
  on si.shortlist_id = s.id
join public.offerpsp_leads l
  on l.lead_id = s.lead_id
where s.status = 'shared'
  and l.client_user_id = auth.uid();

revoke all on public.offerpsp_client_shortlist from public, anon;
grant select on public.offerpsp_client_shortlist to authenticated;

comment on view public.offerpsp_client_shortlist is
  'Client-safe shortlist projection. Provider identity, internal IDs, websites, base rates, margins and matching internals are intentionally excluded.';
