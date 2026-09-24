create table if not exists private.offerpsp_deal_outcomes (
  id uuid primary key default gen_random_uuid(),
  introduction_id uuid not null unique references private.offerpsp_introductions(id) on delete cascade,
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  provider_id uuid not null references private.offerpsp_providers(id) on delete restrict,
  route_id uuid not null references private.offerpsp_offer_routes(id) on delete restrict,
  result text not null check (result in ('won', 'lost')),
  reason_code text not null check (reason_code in (
    'launched', 'commercial_terms', 'compliance', 'technical', 'no_response',
    'timing', 'competitor', 'merchant_cancelled', 'provider_capacity', 'other'
  )),
  integration_status text not null default 'not_started' check (integration_status in (
    'not_started', 'technical_setup', 'testing', 'live', 'stopped'
  )),
  live_at timestamptz,
  expected_monthly_volume numeric check (expected_monthly_volume is null or expected_monthly_volume >= 0),
  actual_monthly_volume numeric check (actual_monthly_volume is null or actual_monthly_volume >= 0),
  volume_currency text,
  quality_score smallint check (quality_score is null or quality_score between 1 and 5),
  follow_up_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (result <> 'won' or integration_status in ('technical_setup', 'testing', 'live', 'stopped')),
  check (actual_monthly_volume is null or volume_currency is not null)
);

create index if not exists offerpsp_deal_outcomes_provider_idx
  on private.offerpsp_deal_outcomes(provider_id, created_at desc);
create index if not exists offerpsp_deal_outcomes_result_idx
  on private.offerpsp_deal_outcomes(result, reason_code, created_at desc);

drop trigger if exists offerpsp_deal_outcomes_set_updated_at
  on private.offerpsp_deal_outcomes;
create trigger offerpsp_deal_outcomes_set_updated_at
before update on private.offerpsp_deal_outcomes
for each row execute function public.set_offerpsp_updated_at();

create or replace function public.record_offerpsp_deal_outcome(
  p_introduction_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_introduction private.offerpsp_introductions;
  v_outcome private.offerpsp_deal_outcomes;
  v_result text := nullif(trim(p_payload ->> 'result'), '');
  v_reason text := nullif(trim(p_payload ->> 'reason_code'), '');
  v_integration_status text := coalesce(nullif(trim(p_payload ->> 'integration_status'), ''), 'not_started');
  v_notes text := nullif(trim(p_payload ->> 'notes'), '');
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Deal outcome payload must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) supplied(key)
    where supplied.key <> all (array[
      'result', 'reason_code', 'integration_status', 'live_at',
      'expected_monthly_volume', 'actual_monthly_volume', 'volume_currency',
      'quality_score', 'follow_up_at', 'notes'
    ])
  ) then
    raise exception 'Deal outcome contains unsupported fields';
  end if;
  if v_result not in ('won', 'lost') then raise exception 'Result must be won or lost'; end if;
  if v_reason not in (
    'launched', 'commercial_terms', 'compliance', 'technical', 'no_response',
    'timing', 'competitor', 'merchant_cancelled', 'provider_capacity', 'other'
  ) then raise exception 'Unsupported deal outcome reason'; end if;
  if v_integration_status not in ('not_started', 'technical_setup', 'testing', 'live', 'stopped') then
    raise exception 'Unsupported integration status';
  end if;
  if v_result = 'won' and v_integration_status = 'not_started' then
    raise exception 'Won deal must record technical setup, testing, live or stopped status';
  end if;

  select * into v_introduction
  from private.offerpsp_introductions
  where id = p_introduction_id
    and status in ('telegram_created', 'zoom_scheduled', 'won', 'lost')
  for update;
  if not found then raise exception 'Active or completed introduction not found'; end if;

  update private.offerpsp_introductions
  set status = v_result,
      result_notes = v_notes,
      closed_at = coalesce(closed_at, now())
  where id = v_introduction.id
  returning * into v_introduction;

  update public.offerpsp_leads
  set status = v_result
  where lead_id = v_introduction.lead_id;

  insert into private.offerpsp_deal_outcomes(
    introduction_id, lead_id, provider_id, route_id, result, reason_code,
    integration_status, live_at, expected_monthly_volume, actual_monthly_volume,
    volume_currency, quality_score, follow_up_at, notes, created_by, updated_by
  ) values (
    v_introduction.id,
    v_introduction.lead_id,
    v_introduction.provider_id,
    v_introduction.route_id,
    v_result,
    v_reason,
    v_integration_status,
    nullif(trim(p_payload ->> 'live_at'), '')::timestamptz,
    nullif(trim(p_payload ->> 'expected_monthly_volume'), '')::numeric,
    nullif(trim(p_payload ->> 'actual_monthly_volume'), '')::numeric,
    upper(nullif(trim(p_payload ->> 'volume_currency'), '')),
    nullif(trim(p_payload ->> 'quality_score'), '')::smallint,
    nullif(trim(p_payload ->> 'follow_up_at'), '')::timestamptz,
    v_notes,
    auth.uid(),
    auth.uid()
  )
  on conflict (introduction_id) do update
  set result = excluded.result,
      reason_code = excluded.reason_code,
      integration_status = excluded.integration_status,
      live_at = excluded.live_at,
      expected_monthly_volume = excluded.expected_monthly_volume,
      actual_monthly_volume = excluded.actual_monthly_volume,
      volume_currency = excluded.volume_currency,
      quality_score = excluded.quality_score,
      follow_up_at = excluded.follow_up_at,
      notes = excluded.notes,
      updated_by = auth.uid()
  returning * into v_outcome;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) values (
    v_introduction.lead_id,
    auth.uid(),
    'staff',
    'deal_outcome_recorded',
    case when v_result = 'won' then 'Payment cooperation launched' else 'Payment cooperation closed without launch' end,
    v_notes,
    jsonb_build_object(
      'introduction_id', v_introduction.id,
      'result', v_result,
      'reason_code', v_reason,
      'integration_status', v_integration_status,
      'quality_score', v_outcome.quality_score,
      'actual_monthly_volume', v_outcome.actual_monthly_volume,
      'volume_currency', v_outcome.volume_currency
    ),
    false
  );

  return to_jsonb(v_outcome) - 'provider_id' - 'route_id';
end;
$$;

create or replace function public.get_offerpsp_deal_history(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_submitted_at timestamptz;
  v_first_review_at timestamptz;
  v_first_decision_at timestamptz;
  v_first_introduction_at timestamptz;
  v_first_zoom_at timestamptz;
  v_closed_at timestamptz;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  select submitted_at into v_submitted_at from public.offerpsp_leads where lead_id = p_lead_id;
  if not found then raise exception 'OfferPSP lead not found'; end if;

  select min(pr.submitted_at), min(pr.decided_at)
  into v_first_review_at, v_first_decision_at
  from private.offerpsp_provider_reviews pr
  join private.offerpsp_merchant_dossiers d on d.id = pr.dossier_id
  where d.lead_id = p_lead_id;

  select min(i.telegram_created_at), min(i.zoom_scheduled_at), min(i.closed_at)
  into v_first_introduction_at, v_first_zoom_at, v_closed_at
  from private.offerpsp_introductions i
  where i.lead_id = p_lead_id;

  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'hours_to_psp_review', case when v_first_review_at is null then null else round((extract(epoch from (v_first_review_at - v_submitted_at)) / 3600)::numeric, 1) end,
      'hours_to_psp_decision', case when v_first_decision_at is null or v_first_review_at is null then null else round((extract(epoch from (v_first_decision_at - v_first_review_at)) / 3600)::numeric, 1) end,
      'hours_to_telegram', case when v_first_introduction_at is null then null else round((extract(epoch from (v_first_introduction_at - v_submitted_at)) / 3600)::numeric, 1) end,
      'hours_to_zoom', case when v_first_zoom_at is null then null else round((extract(epoch from (v_first_zoom_at - v_submitted_at)) / 3600)::numeric, 1) end,
      'days_to_result', case when v_closed_at is null then null else round((extract(epoch from (v_closed_at - v_submitted_at)) / 86400)::numeric, 1) end
    ),
    'outcomes', coalesce((
      select jsonb_agg(
        to_jsonb(o) - 'provider_id' - 'route_id' || jsonb_build_object(
          'provider_code', p.internal_code,
          'provider_name', p.brand_name,
          'route_code', r.internal_code,
          'route_title', r.client_title
        ) order by o.created_at desc
      )
      from private.offerpsp_deal_outcomes o
      join private.offerpsp_providers p on p.id = o.provider_id
      join private.offerpsp_offer_routes r on r.id = o.route_id
      where o.lead_id = p_lead_id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(activity) order by activity.created_at desc)
      from (
        select id, activity_type, title, body, metadata, created_at
        from public.offerpsp_lead_activities
        where lead_id = p_lead_id
        order by created_at desc
        limit 200
      ) activity
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on private.offerpsp_deal_outcomes from public, anon, authenticated;
grant all on private.offerpsp_deal_outcomes to service_role;

revoke all on function public.record_offerpsp_deal_outcome(uuid,jsonb) from public, anon;
revoke all on function public.get_offerpsp_deal_history(uuid) from public, anon;
grant execute on function public.record_offerpsp_deal_outcome(uuid,jsonb) to authenticated;
grant execute on function public.get_offerpsp_deal_history(uuid) to authenticated;

comment on table private.offerpsp_deal_outcomes is
  'Structured commercial result and quality record for a controlled PSP introduction. Private provider identity never enters the client workspace.';
