create or replace function private.offerpsp_client_source_terms(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = private, pg_catalog
as $$
declare
  v_raw_block text;
  v_risk_terms jsonb;
  v_card_issue_match text[];
  v_rolling_reserve_match text[];
begin
  select r.raw_block, r.risk_terms
  into v_raw_block, v_risk_terms
  from private.offerpsp_offer_routes r
  where r.id = p_route_id;

  if not found then
    return '{}'::jsonb;
  end if;

  v_card_issue_match := regexp_match(
    coalesce(v_raw_block, ''),
    '(?:^|[\n\r])[[:space:]]*Card issue[[:space:]]*:[[:space:]]*([^\n\r]+)',
    'i'
  );
  v_rolling_reserve_match := regexp_match(
    coalesce(v_raw_block, ''),
    '(?:^|[\n\r])[[:space:]]*(RR[[:space:]]*:[^\n\r]+)',
    'i'
  );
  if nullif(trim(v_rolling_reserve_match[1]), '') is not null then
    v_risk_terms := coalesce(v_risk_terms, '{}'::jsonb)
      || jsonb_build_object('rolling_reserve', trim(v_rolling_reserve_match[1]));
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'card_issue', nullif(trim(v_card_issue_match[1]), ''),
    'risk_terms', coalesce(v_risk_terms, '{}'::jsonb)
  ));
end;
$$;

create or replace function private.enrich_offerpsp_client_snapshot()
returns trigger
language plpgsql
security definer
set search_path = private, pg_catalog
as $$
begin
  if new.offer_route_id is not null and new.client_snapshot is not null then
    new.client_snapshot := new.client_snapshot
      || private.offerpsp_client_source_terms(new.offer_route_id);
  end if;
  return new;
end;
$$;

drop trigger if exists offerpsp_shortlist_items_enrich_client_snapshot
  on public.offerpsp_shortlist_items;
create trigger offerpsp_shortlist_items_enrich_client_snapshot
before insert or update of offer_route_id, client_snapshot
on public.offerpsp_shortlist_items
for each row execute function private.enrich_offerpsp_client_snapshot();

update public.offerpsp_shortlist_items si
set client_snapshot = si.client_snapshot
  || private.offerpsp_client_source_terms(si.offer_route_id)
where si.offer_route_id is not null
  and si.client_snapshot is not null;

create or replace function public.list_offerpsp_client_offers(p_lead_id uuid default null)
returns table (
  shortlist_id uuid,
  lead_id uuid,
  version integer,
  title text,
  introduction text,
  status text,
  shared_at timestamptz,
  rank integer,
  option_code text,
  client_note text,
  client_response text,
  client_responded_at timestamptz,
  route_title text,
  coverage_scope text,
  geos jsonb,
  currencies jsonb,
  flow text,
  methods jsonb,
  card_brands jsonb,
  card_issue text,
  traffic_types jsonb,
  integrations jsonb,
  client_fees jsonb,
  limits jsonb,
  settlement jsonb,
  risk_terms jsonb,
  valid_through text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    s.id,
    s.lead_id,
    s.version,
    s.title::text,
    s.introduction::text,
    s.status::text,
    s.shared_at,
    si.rank,
    si.public_code::text,
    coalesce(
      nullif(si.client_note, ''),
      'Selected for your operating profile. Detailed partner terms are disclosed during the managed introduction.'
    )::text,
    si.client_response::text,
    si.client_responded_at,
    (si.client_snapshot ->> 'title')::text,
    (si.client_snapshot ->> 'coverage_scope')::text,
    si.client_snapshot -> 'geos',
    si.client_snapshot -> 'currencies',
    (si.client_snapshot ->> 'flow')::text,
    si.client_snapshot -> 'methods',
    si.client_snapshot -> 'card_brands',
    (si.client_snapshot ->> 'card_issue')::text,
    si.client_snapshot -> 'traffic_types',
    si.client_snapshot -> 'integrations',
    si.client_snapshot -> 'client_fees',
    si.client_snapshot -> 'limits',
    coalesce((
      select jsonb_agg(
        settlement_term - 'fee_percent' - 'fixed_fee' - 'fixed_fee_currency'
        order by ordinal
      )
      from jsonb_array_elements(coalesce(si.client_snapshot -> 'settlement', '[]'::jsonb))
        with ordinality as settlement_terms(settlement_term, ordinal)
    ), '[]'::jsonb),
    coalesce(si.client_snapshot -> 'risk_terms', '{}'::jsonb),
    (si.client_snapshot ->> 'valid_through')::text
  from public.offerpsp_shortlists s
  join public.offerpsp_shortlist_items si on si.shortlist_id = s.id
  where s.status = 'shared'
    and (p_lead_id is null or s.lead_id = p_lead_id)
    and public.can_access_offerpsp_client_lead(s.lead_id)
  order by s.shared_at desc, si.rank;
$$;

revoke all on function public.list_offerpsp_client_offers(uuid) from public, anon;
grant execute on function public.list_offerpsp_client_offers(uuid) to authenticated;
revoke all on function private.offerpsp_client_source_terms(uuid) from public, anon, authenticated;
revoke all on function private.enrich_offerpsp_client_snapshot() from public, anon, authenticated;
grant execute on function private.offerpsp_client_source_terms(uuid) to service_role;

comment on function public.list_offerpsp_client_offers(uuid) is
  'Client-safe offer projection with explicit display fields. PayIn and PayOut remain separate fee and limit sections inside their source offer.';
