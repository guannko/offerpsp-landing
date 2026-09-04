-- Durable acquisition identity and conversion milestones for Google Ads,
-- other paid channels and future OfferPSP affiliate/subagent links.

alter table public.offerpsp_leads
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists dclid text,
  add column if not exists msclkid text,
  add column if not exists fbclid text,
  add column if not exists li_fat_id text,
  add column if not exists ttclid text,
  add column if not exists affiliate_id text,
  add column if not exists affiliate_click_id text,
  add column if not exists first_touch_at timestamptz,
  add column if not exists last_touch_at timestamptz,
  add column if not exists ad_user_data_consent text not null default 'unknown';

alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_ad_user_data_consent_check,
  add constraint offerpsp_leads_ad_user_data_consent_check
    check (ad_user_data_consent in ('unknown', 'granted', 'denied')),
  drop constraint if exists offerpsp_leads_click_id_lengths_check,
  add constraint offerpsp_leads_click_id_lengths_check check (
    length(coalesce(gclid, '')) <= 300
    and length(coalesce(gbraid, '')) <= 300
    and length(coalesce(wbraid, '')) <= 300
    and length(coalesce(dclid, '')) <= 300
    and length(coalesce(msclkid, '')) <= 300
    and length(coalesce(fbclid, '')) <= 300
    and length(coalesce(li_fat_id, '')) <= 300
    and length(coalesce(ttclid, '')) <= 300
    and length(coalesce(affiliate_id, '')) <= 300
    and length(coalesce(affiliate_click_id, '')) <= 300
  );

create index if not exists offerpsp_leads_google_click_idx
  on public.offerpsp_leads (gclid)
  where gclid is not null;
create index if not exists offerpsp_leads_google_braid_idx
  on public.offerpsp_leads (coalesce(gbraid, wbraid))
  where gbraid is not null or wbraid is not null;
create index if not exists offerpsp_leads_affiliate_click_idx
  on public.offerpsp_leads (affiliate_id, affiliate_click_id)
  where affiliate_id is not null or affiliate_click_id is not null;

comment on column public.offerpsp_leads.gclid is
  'Case-sensitive Google click identifier captured from the submitted request journey.';
comment on column public.offerpsp_leads.ad_user_data_consent is
  'Independent advertising-platform user-data consent signal. The service intake consent does not grant this automatically.';

create table if not exists private.offerpsp_conversion_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  event_name text not null check (event_name in (
    'lead_submitted', 'qualified_lead', 'provider_accepted',
    'introduction_created', 'deal_won', 'processing_live'
  )),
  event_at timestamptz not null,
  value_amount numeric check (value_amount is null or value_amount >= 0),
  value_currency text,
  source_snapshot jsonb not null default '{}'::jsonb,
  ad_user_data_consent text not null default 'unknown'
    check (ad_user_data_consent in ('unknown', 'granted', 'denied')),
  google_export_status text not null default 'not_applicable'
    check (google_export_status in (
      'not_applicable', 'blocked_consent', 'ready', 'exported', 'failed', 'cancelled'
    )),
  google_exported_at timestamptz,
  google_export_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, event_name),
  check (value_amount is null or value_currency is not null)
);

create index if not exists offerpsp_conversion_events_export_idx
  on private.offerpsp_conversion_events (google_export_status, event_at)
  where google_export_status in ('blocked_consent', 'ready', 'failed');
create index if not exists offerpsp_conversion_events_source_idx
  on private.offerpsp_conversion_events ((source_snapshot ->> 'source_platform'), event_at desc);

drop trigger if exists offerpsp_conversion_events_set_updated_at
  on private.offerpsp_conversion_events;
create trigger offerpsp_conversion_events_set_updated_at
before update on private.offerpsp_conversion_events
for each row execute function public.set_offerpsp_updated_at();

revoke all on private.offerpsp_conversion_events from public, anon, authenticated;
grant all on private.offerpsp_conversion_events to service_role;

create or replace function private.upsert_offerpsp_conversion_event(
  p_lead_id uuid,
  p_event_name text,
  p_event_at timestamptz,
  p_value_amount numeric default null,
  p_value_currency text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_lead public.offerpsp_leads;
  v_has_google_click boolean;
  v_export_status text;
  v_snapshot jsonb;
begin
  select * into v_lead
  from public.offerpsp_leads
  where lead_id = p_lead_id;
  if not found then return; end if;

  v_has_google_click := coalesce(v_lead.gclid, v_lead.gbraid, v_lead.wbraid) is not null;
  v_export_status := case
    when not v_has_google_click then 'not_applicable'
    when v_lead.ad_user_data_consent = 'granted' then 'ready'
    when v_lead.ad_user_data_consent = 'denied' then 'not_applicable'
    else 'blocked_consent'
  end;
  v_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'source_category', v_lead.source_category,
    'source_platform', v_lead.source_platform,
    'source_referrer', v_lead.source_referrer,
    'landing_path', v_lead.landing_path,
    'utm_source', v_lead.utm_source,
    'utm_medium', v_lead.utm_medium,
    'utm_campaign', v_lead.utm_campaign,
    'utm_term', v_lead.utm_term,
    'utm_content', v_lead.utm_content,
    'gclid', v_lead.gclid,
    'gbraid', v_lead.gbraid,
    'wbraid', v_lead.wbraid,
    'affiliate_id', v_lead.affiliate_id,
    'affiliate_click_id', v_lead.affiliate_click_id,
    'first_touch_at', v_lead.first_touch_at,
    'last_touch_at', v_lead.last_touch_at
  ));

  insert into private.offerpsp_conversion_events (
    lead_id, event_name, event_at, value_amount, value_currency,
    source_snapshot, ad_user_data_consent, google_export_status
  ) values (
    p_lead_id, p_event_name, coalesce(p_event_at, now()), p_value_amount,
    upper(nullif(trim(p_value_currency), '')), v_snapshot,
    v_lead.ad_user_data_consent, v_export_status
  )
  on conflict (lead_id, event_name) do update set
    event_at = least(private.offerpsp_conversion_events.event_at, excluded.event_at),
    value_amount = coalesce(excluded.value_amount, private.offerpsp_conversion_events.value_amount),
    value_currency = coalesce(excluded.value_currency, private.offerpsp_conversion_events.value_currency),
    source_snapshot = excluded.source_snapshot,
    ad_user_data_consent = excluded.ad_user_data_consent,
    google_export_status = case
      when private.offerpsp_conversion_events.google_export_status = 'exported'
        then 'exported'
      else excluded.google_export_status
    end,
    google_export_error = case
      when private.offerpsp_conversion_events.google_export_status = 'exported'
        then private.offerpsp_conversion_events.google_export_error
      else null
    end;
end;
$$;

revoke all on function private.upsert_offerpsp_conversion_event(uuid,text,timestamptz,numeric,text)
  from public, anon, authenticated;
grant execute on function private.upsert_offerpsp_conversion_event(uuid,text,timestamptz,numeric,text)
  to service_role;

create or replace function private.capture_offerpsp_lead_conversion_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_event_name text;
begin
  if tg_op = 'INSERT' then
    perform private.upsert_offerpsp_conversion_event(
      new.lead_id, 'lead_submitted', new.submitted_at, null, null
    );
    return new;
  end if;

  if new.ad_user_data_consent is distinct from old.ad_user_data_consent then
    update private.offerpsp_conversion_events event
    set ad_user_data_consent = new.ad_user_data_consent,
        google_export_status = case
          when coalesce(new.gclid, new.gbraid, new.wbraid) is null then 'not_applicable'
          when new.ad_user_data_consent = 'granted' then 'ready'
          when new.ad_user_data_consent = 'denied' then 'not_applicable'
          else 'blocked_consent'
        end,
        google_export_error = null
    where event.lead_id = new.lead_id
      and event.google_export_status <> 'exported';
  end if;

  if new.status is not distinct from old.status then return new; end if;
  v_event_name := case new.status
    when 'qualified' then 'qualified_lead'
    when 'provider_accepted' then 'provider_accepted'
    when 'telegram_created' then 'introduction_created'
    when 'won' then 'deal_won'
    else null
  end;
  if v_event_name is not null then
    perform private.upsert_offerpsp_conversion_event(
      new.lead_id, v_event_name, coalesce(new.updated_at, now()), null, null
    );
  end if;
  return new;
end;
$$;

revoke all on function private.capture_offerpsp_lead_conversion_event()
  from public, anon, authenticated;
grant execute on function private.capture_offerpsp_lead_conversion_event() to service_role;

drop trigger if exists offerpsp_leads_capture_conversion_event on public.offerpsp_leads;
create trigger offerpsp_leads_capture_conversion_event
after insert or update of status, ad_user_data_consent on public.offerpsp_leads
for each row execute function private.capture_offerpsp_lead_conversion_event();

create or replace function private.capture_offerpsp_live_conversion_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.integration_status = 'live'
    and (tg_op = 'INSERT' or old.integration_status is distinct from new.integration_status)
  then
    perform private.upsert_offerpsp_conversion_event(
      new.lead_id,
      'processing_live',
      coalesce(new.live_at, new.updated_at, now()),
      new.actual_monthly_volume,
      new.volume_currency
    );
  end if;
  return new;
end;
$$;

revoke all on function private.capture_offerpsp_live_conversion_event()
  from public, anon, authenticated;
grant execute on function private.capture_offerpsp_live_conversion_event() to service_role;

drop trigger if exists offerpsp_outcomes_capture_live_conversion
  on private.offerpsp_deal_outcomes;
create trigger offerpsp_outcomes_capture_live_conversion
after insert or update of integration_status, live_at, actual_monthly_volume, volume_currency
on private.offerpsp_deal_outcomes
for each row execute function private.capture_offerpsp_live_conversion_event();

insert into private.offerpsp_conversion_events (
  lead_id, event_name, event_at, source_snapshot, ad_user_data_consent, google_export_status
)
select
  lead.lead_id,
  'lead_submitted',
  lead.submitted_at,
  jsonb_strip_nulls(jsonb_build_object(
    'source_category', lead.source_category,
    'source_platform', lead.source_platform,
    'source_referrer', lead.source_referrer,
    'landing_path', lead.landing_path,
    'utm_source', lead.utm_source,
    'utm_medium', lead.utm_medium,
    'utm_campaign', lead.utm_campaign
  )),
  lead.ad_user_data_consent,
  case
    when coalesce(lead.gclid, lead.gbraid, lead.wbraid) is null then 'not_applicable'
    when lead.ad_user_data_consent = 'granted' then 'ready'
    when lead.ad_user_data_consent = 'denied' then 'not_applicable'
    else 'blocked_consent'
  end
from public.offerpsp_leads lead
on conflict (lead_id, event_name) do nothing;

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
      and coalesce(lead.company, '') !~* '(^|[^a-z])e2e([^a-z]|$)|workspace-role'
      and coalesce(lead.work_email, '') !~* '\\.invalid$'
  ), outcomes as (
    select outcome.lead_id,
      bool_or(outcome.result = 'won') as won,
      bool_or(outcome.integration_status = 'live') as live,
      sum(outcome.actual_monthly_volume) filter (
        where outcome.integration_status = 'live' and outcome.actual_monthly_volume is not null
      ) as live_volume
    from private.offerpsp_deal_outcomes outcome
    group by outcome.lead_id
  ), enriched as (
    select lead.*,
      coalesce(nullif(lead.source_platform, ''), nullif(lead.utm_source, ''), 'direct') as acquisition_source,
      coalesce(outcome.won, lead.status = 'won') as won,
      coalesce(outcome.live, false) as live,
      outcome.live_volume,
      lead.status in (
        'qualified', 'matched', 'matching', 'shortlist_ready', 'shared', 'option_selected',
        'dossier_ready', 'provider_reviewing', 'provider_needs_info', 'provider_accepted',
        'provider_declined', 'telegram_created', 'zoom_scheduled', 'negotiating', 'won', 'lost'
      ) as qualified
    from business_leads lead
    left join outcomes outcome on outcome.lead_id = lead.lead_id
  ), source_funnel as (
    select acquisition_source as source,
      coalesce(nullif(source_category, ''), 'unattributed') as category,
      count(*)::integer as leads,
      count(*) filter (where qualified)::integer as qualified,
      count(*) filter (where won)::integer as won,
      count(*) filter (where live)::integer as live
    from enriched
    group by acquisition_source, coalesce(nullif(source_category, ''), 'unattributed')
    order by count(*) desc, acquisition_source
  ), campaign_funnel as (
    select coalesce(nullif(utm_source, ''), acquisition_source) as source,
      coalesce(nullif(utm_medium, ''), '—') as medium,
      coalesce(nullif(utm_campaign, ''), '—') as campaign,
      count(*)::integer as leads,
      count(*) filter (where qualified)::integer as qualified,
      count(*) filter (where won)::integer as won,
      count(*) filter (where live)::integer as live
    from enriched
    where source_category = 'campaign'
       or nullif(utm_campaign, '') is not null
       or coalesce(gclid, gbraid, wbraid, affiliate_click_id) is not null
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
      'paid_leads', (select count(*) from enriched where source_category = 'campaign'),
      'google_ads_leads', (select count(*) from enriched where source_platform = 'google-ads'),
      'affiliate_leads', (select count(*) from enriched where affiliate_id is not null or affiliate_click_id is not null),
      'tracked_clicks', (select count(*) from enriched where coalesce(gclid, gbraid, wbraid, dclid, msclkid, fbclid, li_fat_id, ttclid, affiliate_click_id) is not null),
      'conversion_ready', (select count(*) from private.offerpsp_conversion_events where google_export_status = 'ready'),
      'conversion_blocked_consent', (select count(*) from private.offerpsp_conversion_events where google_export_status = 'blocked_consent')
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

comment on table private.offerpsp_conversion_events is
  'Consent-gated acquisition milestones for offline conversion measurement. No event is exported by this schema alone.';
comment on function public.get_offerpsp_acquisition_funnel() is
  'Staff-only source-to-qualified-to-won-to-live acquisition funnel. Advertising spend is intentionally absent until a live Ads cost source exists.';
