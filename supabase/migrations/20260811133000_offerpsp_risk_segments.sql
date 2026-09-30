-- Separate the commercial risk segment from compliance risk scoring.
-- A route may serve low-risk, high-risk, or both segments.

alter table public.offerpsp_leads
  add column if not exists risk_segment text not null default 'unknown',
  add column if not exists risk_segment_source text not null default 'auto';

alter table public.offerpsp_leads
  drop constraint if exists offerpsp_leads_risk_segment_check,
  add constraint offerpsp_leads_risk_segment_check
    check (risk_segment in ('low', 'high', 'unknown')),
  drop constraint if exists offerpsp_leads_risk_segment_source_check,
  add constraint offerpsp_leads_risk_segment_source_check
    check (risk_segment_source in ('auto', 'staff'));

alter table private.offerpsp_offer_routes
  add column if not exists risk_segments text[] not null default '{}'::text[];

alter table private.offerpsp_offer_routes
  drop constraint if exists offerpsp_offer_routes_risk_segments_check,
  add constraint offerpsp_offer_routes_risk_segments_check check (
    cardinality(risk_segments) > 0
    and risk_segments <@ array['low', 'high']::text[]
  ) not valid;

create or replace function private.offerpsp_classify_merchant_risk_segment(
  p_vertical text,
  p_business_model text default null
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_value text := lower(concat_ws(' ', p_vertical, p_business_model));
begin
  if v_value ~ '(igaming|casino|gambling|betting|sportsbook|forex|crypto|adult|cbd|nutra)' then
    return 'high';
  end if;
  if v_value ~ '(marketplace|e[ -]?commerce|ecom|retail|saas|travel|education|healthcare|subscription|delivery|hospitality|hotel|nonprofit)' then
    return 'low';
  end if;
  return 'unknown';
end;
$$;

create or replace function private.offerpsp_classify_route_risk_segments(p_verticals text[])
returns text[]
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  v_value text := lower(array_to_string(coalesce(p_verticals, '{}'::text[]), ' '));
  v_result text[] := '{}';
begin
  if v_value ~ '(marketplace|e[ -]?commerce|ecom|retail|saas|travel|education|healthcare|subscription|delivery|hospitality|hotel|nonprofit)' then
    v_result := array_append(v_result, 'low');
  end if;
  if v_value ~ '(igaming|casino|gambling|betting|sportsbook|forex|crypto|adult|cbd|nutra)' then
    v_result := array_append(v_result, 'high');
  end if;
  -- Existing OfferPSP supply was collected for high-risk merchants. Empty or
  -- unfamiliar verticals stay high-risk until staff explicitly reclassifies them.
  if cardinality(v_result) = 0 then
    v_result := array['high']::text[];
  end if;
  return v_result;
end;
$$;

create or replace function private.offerpsp_set_lead_risk_segment()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if new.risk_segment_source = 'auto' then
    new.risk_segment := private.offerpsp_classify_merchant_risk_segment(new.vertical, new.business_model);
  end if;
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_set_lead_risk_segment on public.offerpsp_leads;
create trigger tg_offerpsp_set_lead_risk_segment
before insert or update of vertical, business_model, risk_segment_source
on public.offerpsp_leads
for each row execute function private.offerpsp_set_lead_risk_segment();

create or replace function private.offerpsp_set_route_risk_segments()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  new.risk_segments := array(
    select distinct lower(trim(value))
    from unnest(coalesce(new.risk_segments, '{}'::text[])) value
    where lower(trim(value)) in ('low', 'high')
    order by 1
  );
  if cardinality(new.risk_segments) = 0 and new.revision_of_route_id is not null then
    select risk_segments into new.risk_segments
    from private.offerpsp_offer_routes
    where id = new.revision_of_route_id;
  end if;
  if cardinality(new.risk_segments) = 0 then
    new.risk_segments := private.offerpsp_classify_route_risk_segments(new.verticals);
  end if;
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_set_route_risk_segments on private.offerpsp_offer_routes;
create trigger tg_offerpsp_set_route_risk_segments
before insert or update of risk_segments, verticals, revision_of_route_id
on private.offerpsp_offer_routes
for each row execute function private.offerpsp_set_route_risk_segments();

update public.offerpsp_leads
set risk_segment = private.offerpsp_classify_merchant_risk_segment(vertical, business_model),
    risk_segment_source = 'auto'
where risk_segment_source = 'auto';

update private.offerpsp_offer_routes
set risk_segments = private.offerpsp_classify_route_risk_segments(verticals)
where cardinality(risk_segments) = 0;

alter table private.offerpsp_offer_routes
  validate constraint offerpsp_offer_routes_risk_segments_check;

create index if not exists offerpsp_offer_routes_risk_segments_gin
  on private.offerpsp_offer_routes using gin (risk_segments);
create index if not exists offerpsp_leads_risk_segment_idx
  on public.offerpsp_leads (risk_segment, submitted_at desc);

create or replace function private.offerpsp_enforce_route_match_risk_segment()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead_segment text;
  v_route_segments text[];
begin
  select risk_segment into v_lead_segment
  from public.offerpsp_leads where lead_id = new.lead_id;
  select risk_segments into v_route_segments
  from private.offerpsp_offer_routes where id = new.route_id;

  if v_lead_segment not in ('low', 'high') or not (v_lead_segment = any(coalesce(v_route_segments, '{}'::text[]))) then
    return null;
  end if;

  new.hard_gates := coalesce(new.hard_gates, '{}'::jsonb)
    || jsonb_build_object('risk_segment', true, 'merchant_risk_segment', v_lead_segment);
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_enforce_route_match_risk_segment on private.offerpsp_route_matches;
create trigger tg_offerpsp_enforce_route_match_risk_segment
before insert or update of lead_id, route_id
on private.offerpsp_route_matches
for each row execute function private.offerpsp_enforce_route_match_risk_segment();

-- Remove matches created before commercial segmentation existed. Rebuilds and
-- future inserts are protected by the trigger above.
delete from private.offerpsp_route_matches m
using public.offerpsp_leads l, private.offerpsp_offer_routes r
where m.lead_id = l.lead_id
  and m.route_id = r.id
  and (
    l.risk_segment not in ('low', 'high')
    or not (l.risk_segment = any(r.risk_segments))
  );

create or replace function private.offerpsp_enforce_shortlist_risk_segment()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead_segment text;
  v_route_segments text[];
begin
  if new.offer_route_id is null then return new; end if;
  select l.risk_segment into v_lead_segment
  from public.offerpsp_shortlists s
  join public.offerpsp_leads l on l.lead_id = s.lead_id
  where s.id = new.shortlist_id;
  select risk_segments into v_route_segments
  from private.offerpsp_offer_routes where id = new.offer_route_id;
  if v_lead_segment not in ('low', 'high') then
    raise exception 'Merchant commercial risk segment must be classified before creating a shortlist'
      using errcode = 'P0001';
  end if;
  if not (v_lead_segment = any(coalesce(v_route_segments, '{}'::text[]))) then
    raise exception 'Offer risk segment is incompatible with this merchant'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_enforce_shortlist_risk_segment on public.offerpsp_shortlist_items;
create trigger tg_offerpsp_enforce_shortlist_risk_segment
before insert or update of shortlist_id, offer_route_id
on public.offerpsp_shortlist_items
for each row execute function private.offerpsp_enforce_shortlist_risk_segment();

create or replace function public.set_offerpsp_merchant_risk_segment(
  p_lead_id uuid,
  p_risk_segment text,
  p_source text default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_result public.offerpsp_leads;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  if p_risk_segment not in ('low', 'high', 'unknown') then raise exception 'Unsupported risk segment'; end if;
  if p_source not in ('auto', 'staff') then raise exception 'Unsupported risk segment source'; end if;
  update public.offerpsp_leads
  set risk_segment = p_risk_segment,
      risk_segment_source = p_source,
      updated_at = now()
  where lead_id = p_lead_id
  returning * into v_result;
  if not found then raise exception 'OfferPSP merchant not found'; end if;
  if p_source = 'auto' then
    select * into v_result from public.offerpsp_leads where lead_id = p_lead_id;
  end if;
  perform private.rebuild_offerpsp_route_matches_internal(p_lead_id);
  delete from private.offerpsp_route_matches m
  using private.offerpsp_offer_routes r
  where m.lead_id = p_lead_id
    and m.route_id = r.id
    and (
      v_result.risk_segment not in ('low', 'high')
      or not (v_result.risk_segment = any(r.risk_segments))
    );
  return jsonb_build_object(
    'lead_id', v_result.lead_id,
    'risk_segment', v_result.risk_segment,
    'risk_segment_source', v_result.risk_segment_source
  );
end;
$$;

create or replace function public.get_offerpsp_supply_coverage()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  return jsonb_build_object(
    'routes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'route_id', r.id,
          'provider_id', p.id,
          'provider_name', p.brand_name,
          'provider_code', p.internal_code,
          'route_code', r.internal_code,
          'client_title', r.client_title,
          'status', r.status,
          'batch_version', b.batch_version,
          'coverage_scope', r.coverage_scope,
          'geos', r.geos,
          'currencies', r.currencies,
          'methods', r.methods,
          'verticals', r.verticals,
          'risk_segments', r.risk_segments,
          'traffic_types', r.traffic_types,
          'flow', r.flow,
          'is_stale', false,
          'open_error_count', (
            select count(*)
            from private.offerpsp_route_anomalies a
            where a.route_id = r.id
              and a.status = 'open'
              and a.severity = 'error'
          ),
          'open_warning_count', (
            select count(*)
            from private.offerpsp_route_anomalies a
            where a.route_id = r.id
              and a.status = 'open'
              and a.severity = 'warning'
          ),
          'margin_ready', p.margin_included_default or exists (
            select 1
            from private.offerpsp_margin_policies mp
            where mp.provider_id = p.id
              and (mp.route_id is null or mp.route_id = r.id)
              and mp.active
              and mp.effective_from <= now()
              and (mp.effective_to is null or mp.effective_to > now())
          )
        )
        order by
          case r.status when 'published' then 0 when 'paused' then 1 when 'review' then 2 else 3 end,
          p.strategic_priority desc,
          p.brand_name,
          r.client_title
      )
      from private.offerpsp_offer_routes r
      join private.offerpsp_providers p on p.id = r.provider_id
      join private.offerpsp_rate_card_batches b on b.id = r.batch_id
      where r.status in ('published', 'paused', 'review', 'draft')
    ), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

create or replace function public.set_offerpsp_route_risk_segments(
  p_route_id uuid,
  p_risk_segments text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_route private.offerpsp_offer_routes;
begin
  if not public.is_offerpsp_staff() then raise exception 'OfferPSP staff access required'; end if;
  select * into v_route from private.offerpsp_offer_routes where id = p_route_id for update;
  if not found then raise exception 'OfferPSP route not found'; end if;
  if v_route.status in ('published', 'paused', 'archived') then
    raise exception 'Create an editable route version before changing its risk segment';
  end if;
  update private.offerpsp_offer_routes
  set risk_segments = coalesce(p_risk_segments, '{}'::text[]), updated_at = now()
  where id = p_route_id returning * into v_route;
  insert into private.offerpsp_supply_activities(provider_id, route_id, batch_id, actor_user_id, action_type, summary, after_state)
  values (v_route.provider_id, v_route.id, v_route.batch_id, auth.uid(), 'route_risk_segments_updated', 'Commercial risk segments updated', jsonb_build_object('risk_segments', v_route.risk_segments));
  return jsonb_build_object('route_id', v_route.id, 'risk_segments', v_route.risk_segments);
end;
$$;

revoke all on function public.set_offerpsp_merchant_risk_segment(uuid, text, text) from public, anon;
revoke all on function public.set_offerpsp_route_risk_segments(uuid, text[]) from public, anon;
grant execute on function public.set_offerpsp_merchant_risk_segment(uuid, text, text) to authenticated;
grant execute on function public.set_offerpsp_route_risk_segments(uuid, text[]) to authenticated;
revoke all on function public.get_offerpsp_supply_coverage() from public, anon;
grant execute on function public.get_offerpsp_supply_coverage() to authenticated;

revoke all on function private.offerpsp_classify_merchant_risk_segment(text, text) from public, anon, authenticated;
revoke all on function private.offerpsp_classify_route_risk_segments(text[]) from public, anon, authenticated;
revoke all on function private.offerpsp_set_lead_risk_segment() from public, anon, authenticated;
revoke all on function private.offerpsp_set_route_risk_segments() from public, anon, authenticated;
revoke all on function private.offerpsp_enforce_route_match_risk_segment() from public, anon, authenticated;
revoke all on function private.offerpsp_enforce_shortlist_risk_segment() from public, anon, authenticated;
grant execute on function private.offerpsp_classify_merchant_risk_segment(text, text) to service_role;
grant execute on function private.offerpsp_classify_route_risk_segments(text[]) to service_role;

comment on column public.offerpsp_leads.risk_segment is
  'Commercial merchant segment (low/high), distinct from compliance risk_level.';
comment on column private.offerpsp_offer_routes.risk_segments is
  'Commercial merchant segments supported by this route. A route may support both low and high risk.';
