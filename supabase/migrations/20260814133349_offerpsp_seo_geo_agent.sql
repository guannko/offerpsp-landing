alter table public.offerpsp_technical_audits
  add column if not exists agent_analysis jsonb not null default '{}'::jsonb;

comment on column public.offerpsp_technical_audits.agent_analysis is
  'Read-only structured recommendations from the dedicated OfferPSP SEO/GEO agent; SiteOne scores remain deterministic.';
