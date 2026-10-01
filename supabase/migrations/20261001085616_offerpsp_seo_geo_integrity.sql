-- Repair truthful acquisition and serialize staff/scheduled audits. No lead mutation.
create or replace function public.get_offerpsp_acquisition_funnel()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  with business_leads as (
    select lead.*
    from public.offerpsp_leads lead
    where coalesce(lead.record_state, 'active') <> 'archived'
      and coalesce(lead.status, '') <> 'spam'
      and not private.offerpsp_is_qa_lead(lead)
  ), outcomes as (
    select outcome.lead_id, bool_or(outcome.result = 'won') as won,
      bool_or(outcome.integration_status = 'live') as live,
      sum(outcome.actual_monthly_volume) filter (where outcome.integration_status = 'live' and outcome.actual_monthly_volume is not null) as live_volume
    from private.offerpsp_deal_outcomes outcome
    group by outcome.lead_id
  ), enriched as (
    select lead.*,
      coalesce(nullif(lead.source_platform, ''), nullif(lead.utm_source, ''), nullif(lead.source_referrer, ''), 'Не определён') as acquisition_source,
      (nullif(trim(lead.gclid), '') is not null or nullif(trim(lead.gbraid), '') is not null or nullif(trim(lead.wbraid), '') is not null
       or nullif(trim(lead.dclid), '') is not null or nullif(trim(lead.msclkid), '') is not null
       or lower(trim(coalesce(lead.utm_medium, ''))) in ('cpc','ppc','paid','paid_search','paid_social','display','cpm','cpv','retargeting')) as paid_evidence,
      coalesce(outcome.won, lead.status = 'won') as won,
      coalesce(outcome.live, false) as live,
      outcome.live_volume,
      lead.status in ('qualified', 'matched', 'matching', 'shortlist_ready', 'shared', 'option_selected', 'dossier_ready', 'provider_reviewing', 'provider_needs_info', 'provider_accepted', 'provider_declined', 'telegram_created', 'zoom_scheduled', 'negotiating', 'won', 'lost') as qualified
    from business_leads lead
    left join outcomes outcome on outcome.lead_id = lead.lead_id
  ), source_funnel as (
    select acquisition_source as source, coalesce(nullif(source_category, ''), 'unattributed') as category,
      count(*)::integer as leads, count(*) filter (where qualified)::integer as qualified,
      count(*) filter (where won)::integer as won, count(*) filter (where live)::integer as live
    from enriched
    group by acquisition_source, coalesce(nullif(source_category, ''), 'unattributed')
    order by count(*) desc, acquisition_source
  ), campaign_funnel as (
    select coalesce(nullif(utm_source, ''), acquisition_source) as source,
      coalesce(nullif(utm_medium, ''), '—') as medium, coalesce(nullif(utm_campaign, ''), '—') as campaign,
      count(*)::integer as leads, count(*) filter (where qualified)::integer as qualified,
      count(*) filter (where won)::integer as won, count(*) filter (where live)::integer as live
    from enriched
    where source_category = 'campaign' or nullif(utm_campaign, '') is not null or coalesce(gclid, gbraid, wbraid, affiliate_click_id) is not null
    group by 1, 2, 3
    order by count(*) desc, 1, 2, 3
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'leads', (select count(*) from enriched),
      'qualified', (select count(*) from enriched where qualified),
      'won', (select count(*) from enriched where won),
      'live', (select count(*) from enriched where live),
      'paid_leads', (select count(*) from enriched where paid_evidence),
      'google_ads_leads', (select count(*) from enriched where nullif(trim(gclid), '') is not null or nullif(trim(gbraid), '') is not null or nullif(trim(wbraid), '') is not null),
      'affiliate_leads', (select count(*) from enriched where affiliate_id is not null or affiliate_click_id is not null),
      'tracked_clicks', (select count(*) from enriched where coalesce(gclid, gbraid, wbraid, dclid, msclkid, fbclid, li_fat_id, ttclid, affiliate_click_id) is not null),
      'conversion_ready', (select count(*) from private.offerpsp_conversion_events event join enriched lead on lead.lead_id = event.lead_id where event.google_export_status = 'ready'),
      'conversion_blocked_consent', (select count(*) from private.offerpsp_conversion_events event join enriched lead on lead.lead_id = event.lead_id where event.google_export_status = 'blocked_consent')
    ),
    'sources', coalesce((select jsonb_agg(to_jsonb(source_funnel)) from source_funnel), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(campaign_funnel)) from campaign_funnel), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(to_jsonb(recent) order by recent.submitted_at desc)
      from (
        select lead_id, company, submitted_at, acquisition_source as source,
          source_category, utm_medium, utm_campaign, landing_path,
          coalesce(gclid, gbraid, wbraid) is not null as has_google_click,
          affiliate_id is not null or affiliate_click_id is not null as has_affiliate_click,
          qualified, won, live
        from enriched
        order by submitted_at desc
        limit 20
      ) recent
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_offerpsp_acquisition_funnel() from public, anon;
grant execute on function public.get_offerpsp_acquisition_funnel() to authenticated;

-- Correct only states that are provably false: a thread whose last recorded
-- message is inbound cannot truthfully be waiting for the counterparty.


create or replace function private.reserve_offerpsp_seo_audit(p_source text, p_requester uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_run public.offerpsp_seo_audit_runs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('offerpsp.seo.audit', 0));
  update public.offerpsp_seo_audit_runs
    set status='failed', completed_at=now(), error_message='Interrupted: audit exceeded its execution lease',
        metadata=metadata || jsonb_build_object('interrupted',true)
    where status in ('queued','running') and requested_at < now()-interval '10 minutes';
  select * into v_run from public.offerpsp_seo_audit_runs
    where status in ('queued','running') order by requested_at desc limit 1;
  if found then return to_jsonb(v_run)||jsonb_build_object('reused',true); end if;
  insert into public.offerpsp_seo_audit_runs(status,trigger_source,requested_by)
    values('queued',p_source,p_requester) returning * into v_run;
  return to_jsonb(v_run)||jsonb_build_object('reused',false);
end; $$;
revoke all on function private.reserve_offerpsp_seo_audit(text,uuid) from public,anon,authenticated,service_role;

create or replace function public.request_offerpsp_seo_audit()
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  return private.reserve_offerpsp_seo_audit('staff',auth.uid());
end; $$;
revoke all on function public.request_offerpsp_seo_audit() from public,anon,service_role;
grant execute on function public.request_offerpsp_seo_audit() to authenticated;

create or replace function public.reserve_offerpsp_scheduled_seo_audit()
returns jsonb language sql security definer set search_path = pg_catalog, public, private as $$
  select private.reserve_offerpsp_seo_audit('schedule',null);
$$;
revoke all on function public.reserve_offerpsp_scheduled_seo_audit() from public,anon,authenticated;
grant execute on function public.reserve_offerpsp_scheduled_seo_audit() to service_role;

-- Preserve history, closing orphaned runs without pretending they completed.
update public.offerpsp_seo_audit_runs
  set status='failed', completed_at=now(), error_message='Interrupted: audit exceeded its execution lease',
      metadata=metadata || jsonb_build_object('interrupted',true)
  where status in ('queued','running') and requested_at < now()-interval '10 minutes';
create unique index offerpsp_seo_audit_single_active_idx
  on public.offerpsp_seo_audit_runs ((true)) where status in ('queued','running');

create or replace function private.expire_offerpsp_seo_audits()
returns integer language plpgsql set search_path=pg_catalog,public,private as $$
declare v_count integer;
begin
  update public.offerpsp_seo_audit_runs
    set status='failed',completed_at=now(),error_message='Interrupted: audit exceeded its execution lease',
      metadata=metadata||jsonb_build_object('interrupted',true)
    where status in ('queued','running') and requested_at<now()-interval '10 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
revoke all on function private.expire_offerpsp_seo_audits() from public,anon,authenticated,service_role;
select cron.schedule('offerpsp-seo-audit-recovery','*/5 * * * *','select private.expire_offerpsp_seo_audits();');
