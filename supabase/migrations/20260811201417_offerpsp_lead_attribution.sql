alter table public.offerpsp_leads
  add column if not exists source_category text,
  add column if not exists source_platform text,
  add column if not exists source_referrer text,
  add column if not exists landing_path text,
  add column if not exists utm_medium text,
  add column if not exists utm_term text,
  add column if not exists utm_content text,
  add column if not exists attribution jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offerpsp_leads_source_category_check'
  ) then
    alter table public.offerpsp_leads
      add constraint offerpsp_leads_source_category_check
      check (
        source_category is null
        or source_category in ('ai', 'search', 'social', 'referral', 'campaign', 'direct')
      );
  end if;
end
$$;

create index if not exists offerpsp_leads_source_platform_idx
  on public.offerpsp_leads(source_platform)
  where source_platform is not null;

create index if not exists offerpsp_leads_utm_campaign_idx
  on public.offerpsp_leads(utm_campaign)
  where utm_campaign is not null;

comment on column public.offerpsp_leads.attribution is
  'Sanitized first-touch and last-touch acquisition metadata captured by the public OfferPSP intake.';
