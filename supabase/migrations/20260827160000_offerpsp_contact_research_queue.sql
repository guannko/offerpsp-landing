alter table public.psp_providers
  add column if not exists searched_at timestamptz;

comment on column public.psp_providers.searched_at is
  'Last completed automated public-contact research pass. Null means eligible for research.';

create index if not exists psp_providers_pending_contact_research_idx
  on public.psp_providers (id)
  where searched_at is null
    and archived_at is null
    and website is not null
    and btrim(website) <> '';
