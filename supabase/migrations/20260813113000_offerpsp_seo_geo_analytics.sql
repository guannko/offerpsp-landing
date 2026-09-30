create table if not exists public.offerpsp_growth_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  captured_at timestamptz not null default now(),
  visitors integer not null default 0 check (visitors >= 0),
  pageviews integer not null default 0 check (pageviews >= 0),
  countries jsonb not null default '[]'::jsonb,
  referrers jsonb not null default '[]'::jsonb,
  paths jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique (source, period_start, period_end)
);

create table if not exists public.offerpsp_technical_audits (
  id uuid primary key default gen_random_uuid(),
  tool text not null,
  tool_version text,
  target_url text not null,
  audited_at timestamptz not null,
  overall_score numeric(4, 2),
  category_scores jsonb not null default '{}'::jsonb,
  crawl_stats jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  unique (tool, target_url, audited_at)
);

alter table public.offerpsp_growth_analytics_snapshots enable row level security;
alter table public.offerpsp_technical_audits enable row level security;

revoke all on public.offerpsp_growth_analytics_snapshots from public, anon, authenticated;
revoke all on public.offerpsp_technical_audits from public, anon, authenticated;
grant select on public.offerpsp_growth_analytics_snapshots to authenticated;
grant select on public.offerpsp_technical_audits to authenticated;

drop policy if exists offerpsp_growth_analytics_staff_read on public.offerpsp_growth_analytics_snapshots;
create policy offerpsp_growth_analytics_staff_read
  on public.offerpsp_growth_analytics_snapshots
  for select to authenticated
  using (public.is_offerpsp_staff());

drop policy if exists offerpsp_technical_audits_staff_read on public.offerpsp_technical_audits;
create policy offerpsp_technical_audits_staff_read
  on public.offerpsp_technical_audits
  for select to authenticated
  using (public.is_offerpsp_staff());

insert into public.offerpsp_growth_analytics_snapshots (
  source, period_start, period_end, captured_at, visitors, pageviews,
  countries, referrers, paths, limitations, metadata
)
values (
  'vercel_web_analytics',
  '2026-08-11 00:00:00+00',
  '2026-08-14 00:00:00+00',
  now(),
  2,
  2,
  '[{"key":"CY","visitors":2,"pageviews":2}]'::jsonb,
  '[{"key":"direct","visitors":2,"pageviews":2}]'::jsonb,
  '[{"key":"/","visitors":2,"pageviews":2}]'::jsonb,
  '[
    {"code":"utm_dimensions_unavailable","message":"Vercel UTM dimensions require Web Analytics Plus or Enterprise."},
    {"code":"analytics_started_recently","message":"Vercel Web Analytics only contains traffic recorded after 11 August 2026."}
  ]'::jsonb,
  '{"project":"offerpsp-landing","scope":"production","verified":true}'::jsonb
)
on conflict (source, period_start, period_end) do update set
  captured_at = excluded.captured_at,
  visitors = excluded.visitors,
  pageviews = excluded.pageviews,
  countries = excluded.countries,
  referrers = excluded.referrers,
  paths = excluded.paths,
  limitations = excluded.limitations,
  metadata = excluded.metadata;

insert into public.offerpsp_technical_audits (
  tool, tool_version, target_url, audited_at, overall_score,
  category_scores, crawl_stats, issues, metadata
)
values (
  'SiteOne Crawler',
  '2.5.1',
  'https://offerpsp.com/',
  now(),
  9.10,
  '{"performance":10.0,"seo":9.8,"security":7.5,"accessibility":9.5,"best_practices":9.1}'::jsonb,
  '{"urls":10,"successful_urls":10,"redirects":0,"broken_urls":0,"total_size_bytes":196000,"execution_seconds":6.878,"average_request_seconds":0.184,"maximum_request_seconds":0.317}'::jsonb,
  '[
    {"severity":"critical","code":"multiple_h1","count":1,"title":"На одной странице несколько H1","action":"Оставить один основной H1 и перевести остальные заголовки на H2/H3."},
    {"severity":"critical","code":"security_headers","count":4,"title":"На четырёх страницах не хватает защитных HTTP-заголовков","action":"Добавить недостающие security headers в конфигурацию публикации."},
    {"severity":"warning","code":"brotli","count":4,"title":"Четыре страницы отдаются без Brotli","action":"Проверить сжатие статических ответов на production CDN."},
    {"severity":"warning","code":"modern_images","count":1,"title":"Нет WebP/AVIF изображений","action":"Добавлять современные форматы для новых растровых материалов."},
    {"severity":"warning","code":"form_labels","count":1,"title":"В одной форме не хватает связанного label","action":"Связать подписи с полями формы для доступности и автозаполнения."},
    {"severity":"notice","code":"cache_ipv6_meta","count":3,"title":"Есть замечания по cache, IPv6 и длине meta description","action":"Исправлять после критических и предупреждающих пунктов."}
  ]'::jsonb,
  '{"verified":true,"report_format":"html,json,text","scope":"public_site"}'::jsonb
)
on conflict (tool, target_url, audited_at) do nothing;

create or replace function public.get_offerpsp_seo_geo_analytics()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result jsonb;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  with business_leads as (
    select l.*
    from public.offerpsp_leads l
    where coalesce(l.record_state, 'active') <> 'archived'
      and coalesce(l.status, '') not in ('spam')
      and coalesce(l.company, '') !~* '(^|[^a-z])e2e([^a-z]|$)|workspace-role'
      and coalesce(l.work_email, '') !~* '\.invalid$'
  ), attributed_leads as (
    select b.*,
      coalesce(
        nullif(b.source_platform, ''),
        nullif(b.utm_source, ''),
        nullif(b.source_referrer, ''),
        'Не определён'
      ) as acquisition_source
    from business_leads b
  ), source_counts as (
    select acquisition_source as source,
      coalesce(nullif(source_category, ''), 'unattributed') as category,
      count(*)::integer as leads
    from attributed_leads
    group by acquisition_source, coalesce(nullif(source_category, ''), 'unattributed')
    order by count(*) desc, acquisition_source
  ), geo_demand as (
    select upper(trim(geo)) as geo, count(*)::integer as leads
    from business_leads b
    cross join lateral unnest(coalesce(b.target_geos, array[]::text[])) as geo
    where trim(geo) <> ''
    group by upper(trim(geo))
    order by count(*) desc, upper(trim(geo))
    limit 20
  )
  select jsonb_build_object(
    'generated_at', now(),
    'traffic', coalesce((
      select to_jsonb(s) from public.offerpsp_growth_analytics_snapshots s
      order by s.captured_at desc limit 1
    ), '{}'::jsonb),
    'traffic_history', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.captured_at desc)
      from (select * from public.offerpsp_growth_analytics_snapshots order by captured_at desc limit 12) s
    ), '[]'::jsonb),
    'technical_audit', coalesce((
      select to_jsonb(a) from public.offerpsp_technical_audits a
      order by a.audited_at desc limit 1
    ), '{}'::jsonb),
    'audit_history', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.audited_at desc)
      from (select * from public.offerpsp_technical_audits order by audited_at desc limit 12) a
    ), '[]'::jsonb),
    'lead_attribution', jsonb_build_object(
      'total_business_leads', (select count(*) from business_leads),
      'last_30_days', (select count(*) from business_leads where submitted_at >= now() - interval '30 days'),
      'attributed_leads', (
        select count(*) from business_leads
        where nullif(source_platform, '') is not null
           or nullif(utm_source, '') is not null
           or nullif(source_referrer, '') is not null
      ),
      'sources', coalesce((select jsonb_agg(to_jsonb(s)) from source_counts s), '[]'::jsonb),
      'utm', coalesce((
        select jsonb_agg(to_jsonb(u) order by u.leads desc)
        from (
          select coalesce(nullif(utm_source, ''), '—') as source,
            coalesce(nullif(utm_medium, ''), '—') as medium,
            coalesce(nullif(utm_campaign, ''), '—') as campaign,
            count(*)::integer as leads
          from business_leads
          where nullif(utm_source, '') is not null or nullif(utm_campaign, '') is not null
          group by 1, 2, 3
        ) u
      ), '[]'::jsonb),
      'recent', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.submitted_at desc)
        from (
          select lead_id, company, submitted_at, source_category, source_platform,
            source_referrer, landing_path, utm_source, utm_medium, utm_campaign
          from business_leads
          order by submitted_at desc nulls last
          limit 12
        ) r
      ), '[]'::jsonb),
      'geo_demand', coalesce((select jsonb_agg(to_jsonb(g)) from geo_demand g), '[]'::jsonb)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_offerpsp_seo_geo_analytics() from public, anon;
grant execute on function public.get_offerpsp_seo_geo_analytics() to authenticated;

comment on function public.get_offerpsp_seo_geo_analytics() is
  'Staff-only SEO/GEO dashboard payload built from verified traffic snapshots, technical audits and live lead attribution.';
