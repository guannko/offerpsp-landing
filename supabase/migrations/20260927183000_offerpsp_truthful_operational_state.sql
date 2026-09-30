-- Make operational state evidence-based: outbound mail only waits for a reply
-- when staff explicitly requests it, QA fixtures stay out of business analytics,
-- and the staff snapshot exposes the recorded expectation.

alter table public.email_drafts
  add column if not exists response_expected boolean not null default false;

create or replace function public.set_offerpsp_email_draft_response_expected(
  p_draft_id bigint,
  p_response_expected boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_draft public.email_drafts;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required' using errcode = '42501';
  end if;

  select * into v_draft
  from public.email_drafts
  where id = p_draft_id
  for update;

  if not found then raise exception 'Email draft not found'; end if;
  if coalesce(v_draft.status, 'draft') not in ('draft', 'failed', 'sending') then
    raise exception 'Only an unsent draft can change reply expectation';
  end if;

  update public.email_drafts
  set response_expected = coalesce(p_response_expected, false)
  where id = p_draft_id
  returning * into v_draft;

  return to_jsonb(v_draft);
end;
$$;

revoke all on function public.set_offerpsp_email_draft_response_expected(bigint, boolean)
  from public, anon;
grant execute on function public.set_offerpsp_email_draft_response_expected(bigint, boolean)
  to authenticated;

create or replace function private.offerpsp_sync_email_draft()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_email text := private.offerpsp_mail_extract_email(new.to_email);
  v_subject text := coalesce(nullif(trim(new.subject), ''), '(no subject)');
  v_thread_key text := md5(v_email || '|' || private.offerpsp_mail_normalize_subject(v_subject));
  v_thread_id uuid;
  v_previous_thread_id uuid;
  v_counterparty jsonb;
  v_lead_id uuid;
  v_waiting boolean := new.status = 'sent' and coalesce(new.response_expected, false);
begin
  if v_email is null or v_email = '' then return new; end if;

  select thread_id into v_previous_thread_id
  from public.offerpsp_email_messages
  where source_draft_id = new.id;

  v_counterparty := private.offerpsp_mail_resolve_counterparty(v_email);
  begin
    v_lead_id := nullif(trim(new.lead_internal_id), '')::uuid;
  exception when invalid_text_representation then
    v_lead_id := null;
  end;
  v_lead_id := coalesce(v_lead_id, nullif(v_counterparty ->> 'lead_id', '')::uuid);

  insert into public.offerpsp_email_threads(
    thread_key, subject, participant_email, counterparty_type, counterparty_id,
    lead_id, status, unread_count, last_message_at, follow_up_at
  ) values (
    v_thread_key, v_subject, v_email, v_counterparty ->> 'type',
    v_counterparty ->> 'id', v_lead_id,
    case when v_waiting then 'awaiting_reply' else 'open' end,
    0, coalesce(new.created_at, now()),
    case when v_waiting then now() + interval '3 days' else null end
  )
  on conflict (thread_key) do update set
    subject = excluded.subject,
    counterparty_type = case when offerpsp_email_threads.counterparty_type = 'general'
      then excluded.counterparty_type else offerpsp_email_threads.counterparty_type end,
    counterparty_id = coalesce(offerpsp_email_threads.counterparty_id, excluded.counterparty_id),
    lead_id = coalesce(offerpsp_email_threads.lead_id, excluded.lead_id),
    status = case when v_waiting and offerpsp_email_threads.status not in ('closed', 'archived', 'trashed')
      then 'awaiting_reply' else offerpsp_email_threads.status end,
    follow_up_at = case
      when v_waiting and offerpsp_email_threads.status not in ('closed', 'archived', 'trashed')
        then now() + interval '3 days'
      else offerpsp_email_threads.follow_up_at
    end,
    last_message_at = greatest(offerpsp_email_threads.last_message_at, excluded.last_message_at),
    updated_at = now()
  returning id into v_thread_id;

  insert into public.offerpsp_email_messages(
    thread_id, direction, sender_email, recipient_emails, subject, text_body,
    provider, delivery_status, is_read, source_draft_id, sent_at, metadata, created_at
  ) values (
    v_thread_id, 'outbound', 'bizdev@offerpsp.com', array[v_email], v_subject, new.body,
    case when new.status = 'sent' then 'brevo' else 'control_bridge' end,
    coalesce(new.status, 'draft'), true, new.id,
    case when new.status = 'sent' then now() else null end,
    jsonb_build_object('response_expected', coalesce(new.response_expected, false)),
    coalesce(new.created_at, now())
  )
  on conflict (source_draft_id) do update set
    thread_id = excluded.thread_id,
    sender_email = excluded.sender_email,
    recipient_emails = excluded.recipient_emails,
    delivery_status = excluded.delivery_status,
    provider = excluded.provider,
    sent_at = coalesce(offerpsp_email_messages.sent_at, excluded.sent_at),
    metadata = coalesce(offerpsp_email_messages.metadata, '{}'::jsonb) || excluded.metadata,
    text_body = excluded.text_body,
    subject = excluded.subject;

  if v_previous_thread_id is not null and v_previous_thread_id <> v_thread_id
      and not exists (
        select 1 from public.offerpsp_email_messages where thread_id = v_previous_thread_id
      ) then
    delete from public.offerpsp_email_threads
    where id = v_previous_thread_id
      and status = 'open'
      and unread_count = 0;
  end if;

  return new;
end;
$$;

create or replace function public.get_offerpsp_captains_bridge()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  return jsonb_build_object(
    'casino_leads', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by (row_data.record_state = 'active') desc, row_data.updated_at desc nulls last)
      from (
        select id, internal_id, name, website, description, geo, license, software,
          affiliate_program, sphere, email, contact_name, contact_title, telegram,
          phone, linkedin, contact_status, score, source, city, emails_sent,
          last_contacted_at, last_reply_at, reply_status, next_follow_up, notes,
          tags, record_state, archived_at, created_at, updated_at
        from public.casino_leads
        order by (record_state = 'active') desc, updated_at desc nulls last, id desc
        limit 500
      ) row_data
    ), '[]'::jsonb),
    'psp_providers', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by (row_data.record_state = 'active') desc, row_data.updated_at desc nulls last)
      from (
        select id, name, website, geo, cluster, specialization, methods,
          commission_terms, email, contact_name, phone, telegram, linkedin,
          other_contacts, contact_status, provider_status, risk_appetite,
          supported_countries, supported_currencies, payment_methods,
          supported_verticals, restricted_countries, integration_types,
          min_monthly_volume, max_monthly_volume, capabilities_verified_at,
          capabilities_source, notes, record_state, archived_at, created_at, updated_at
        from public.psp_providers
        order by (record_state = 'active') desc, updated_at desc nulls last, id desc
        limit 500
      ) row_data
    ), '[]'::jsonb),
    'email_drafts', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (select id, chat_id, lead_internal_id, to_email, subject, body, status,
          response_expected, created_at
        from public.email_drafts order by created_at desc nulls last, id desc limit 100) row_data
    ), '[]'::jsonb),
    'telegram_log', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (select id, chat_id, role, message, created_at
        from public.chat_logs order by created_at desc nulls last, id desc limit 100) row_data
    ), '[]'::jsonb),
    'bot_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (select id, task_type, payload, priority, scheduled_for, status, result,
        error, created_by, created_at, started_at, completed_at, ref_type, ref_id
        from public.bot_tasks order by created_at desc nulls last, id desc limit 100) row_data
    ), '[]'::jsonb),
    'offerpsp_tasks', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc nulls last)
      from (select id, lead_id, assigned_to, source, title, details, status, priority,
        due_at, completed_at, automation_ref, metadata, created_at, updated_at
        from public.offerpsp_tasks order by created_at desc nulls last limit 100) row_data
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_offerpsp_captains_bridge() from public, anon;
grant execute on function public.get_offerpsp_captains_bridge() to authenticated;

create or replace function private.offerpsp_is_qa_lead(p_lead public.offerpsp_leads)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, public, private
as $$
  select (p_lead).lead_id in (
      'ad724d57-e894-4d16-b7b0-948165aef4bf'::uuid,
      '60e61542-7070-43ef-937b-7f919e9abdb0'::uuid
    )
    or lower(coalesce((p_lead).work_email, '')) like '%.invalid'
    or lower(concat_ws(' ',
      (p_lead).company,
      (p_lead).name,
      (p_lead).work_email,
      (p_lead).company_url,
      (p_lead).source_category,
      (p_lead).source_platform,
      (p_lead).source_referrer,
      (p_lead).utm_source,
      (p_lead).utm_campaign,
      (p_lead).details
    )) similar to '%(paysiski|winpiski|payok e2e test 20260826|autopilot e2e|autopilot test|screening canary|bix instant intake e2e|workspace-role-e2e|portal regression)%';
$$;

revoke all on function private.offerpsp_is_qa_lead(public.offerpsp_leads)
  from public, anon, authenticated;
grant execute on function private.offerpsp_is_qa_lead(public.offerpsp_leads)
  to service_role;

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
      and not private.offerpsp_is_qa_lead(l)
  ), attributed_leads as (
    select b.*,
      coalesce(nullif(b.source_platform, ''), nullif(b.utm_source, ''), nullif(b.source_referrer, ''), 'Не определён') as acquisition_source
    from business_leads b
  ), source_counts as (
    select acquisition_source as source, coalesce(nullif(source_category, ''), 'unattributed') as category, count(*)::integer as leads
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
    'traffic', coalesce((select to_jsonb(s) from public.offerpsp_growth_analytics_snapshots s order by s.captured_at desc limit 1), '{}'::jsonb),
    'traffic_history', coalesce((select jsonb_agg(to_jsonb(s) order by s.captured_at desc) from (select * from public.offerpsp_growth_analytics_snapshots order by captured_at desc limit 12) s), '[]'::jsonb),
    'technical_audit', coalesce((select to_jsonb(a) from public.offerpsp_technical_audits a order by a.audited_at desc limit 1), '{}'::jsonb),
    'audit_history', coalesce((select jsonb_agg(to_jsonb(a) order by a.audited_at desc) from (select * from public.offerpsp_technical_audits order by audited_at desc limit 12) a), '[]'::jsonb),
    'audit_run', coalesce((select to_jsonb(r) from public.offerpsp_seo_audit_runs r order by r.requested_at desc limit 1), '{}'::jsonb),
    'lead_attribution', jsonb_build_object(
      'total_business_leads', (select count(*) from business_leads),
      'last_30_days', (select count(*) from business_leads where submitted_at >= now() - interval '30 days'),
      'attributed_leads', (select count(*) from business_leads where nullif(source_platform, '') is not null or nullif(utm_source, '') is not null or nullif(source_referrer, '') is not null),
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
      coalesce(nullif(lead.source_platform, ''), nullif(lead.utm_source, ''), 'direct') as acquisition_source,
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
      'paid_leads', (select count(*) from enriched where source_category = 'campaign'),
      'google_ads_leads', (select count(*) from enriched where source_platform = 'google-ads'),
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
with last_message as (
  select distinct on (message.thread_id) message.thread_id, message.direction
  from public.offerpsp_email_messages message
  order by message.thread_id, coalesce(message.sent_at, message.received_at, message.created_at) desc, message.id desc
)
update public.offerpsp_email_threads thread
set status = 'open', follow_up_at = null, updated_at = now()
from last_message
where last_message.thread_id = thread.id
  and last_message.direction = 'inbound'
  and thread.status = 'awaiting_reply';

-- This is the automated intake receipt: it explicitly says OfferPSP will make
-- contact if more information is needed, so it must not schedule a reply chase.
update public.offerpsp_email_threads
set status = 'open', follow_up_at = null, updated_at = now()
where id = '92373438-21b0-4df0-8d54-c5617fae0ff0'::uuid
  and status = 'awaiting_reply';

comment on column public.email_drafts.response_expected is
  'Explicit staff intent. Only true may move a sent thread to awaiting_reply and create the automatic three-day follow-up.';
comment on function public.set_offerpsp_email_draft_response_expected(bigint, boolean) is
  'Staff-only reply expectation setter for unsent drafts.';
comment on function private.offerpsp_is_qa_lead(public.offerpsp_leads) is
  'Canonical QA fixture predicate shared by staff analytics functions.';
