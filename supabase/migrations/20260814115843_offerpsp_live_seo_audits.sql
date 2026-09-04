create table if not exists public.offerpsp_seo_audit_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  trigger_source text not null default 'staff'
    check (trigger_source in ('staff', 'schedule', 'system')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  technical_audit_id uuid references public.offerpsp_technical_audits(id) on delete set null,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists offerpsp_seo_audit_runs_requested_at_idx
  on public.offerpsp_seo_audit_runs (requested_at desc);

alter table public.offerpsp_seo_audit_runs enable row level security;

revoke all on public.offerpsp_seo_audit_runs from public, anon, authenticated;
grant select on public.offerpsp_seo_audit_runs to authenticated;
grant select, insert, update on public.offerpsp_seo_audit_runs to service_role;
grant insert on public.offerpsp_technical_audits to service_role;

drop policy if exists offerpsp_seo_audit_runs_staff_read on public.offerpsp_seo_audit_runs;
create policy offerpsp_seo_audit_runs_staff_read
  on public.offerpsp_seo_audit_runs
  for select to authenticated
  using ((select public.is_offerpsp_staff()));

create or replace function public.request_offerpsp_seo_audit()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  existing_run public.offerpsp_seo_audit_runs%rowtype;
  new_run public.offerpsp_seo_audit_runs%rowtype;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select * into existing_run
  from public.offerpsp_seo_audit_runs
  where status in ('queued', 'running')
    and requested_at >= now() - interval '20 minutes'
  order by requested_at desc
  limit 1;

  if found then
    return to_jsonb(existing_run) || jsonb_build_object('reused', true);
  end if;

  insert into public.offerpsp_seo_audit_runs (status, trigger_source, requested_by)
  values ('queued', 'staff', auth.uid())
  returning * into new_run;

  return to_jsonb(new_run) || jsonb_build_object('reused', false);
end;
$$;

revoke all on function public.request_offerpsp_seo_audit() from public, anon;
grant execute on function public.request_offerpsp_seo_audit() to authenticated;

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
    'audit_run', coalesce((
      select to_jsonb(r) from public.offerpsp_seo_audit_runs r
      order by r.requested_at desc limit 1
    ), '{}'::jsonb),
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

comment on table public.offerpsp_seo_audit_runs is
  'Execution journal for real SiteOne technical SEO crawls initiated by staff or schedule.';
comment on function public.request_offerpsp_seo_audit() is
  'Queues one staff-authorized live SEO crawl while suppressing duplicate requests for 20 minutes.';
