-- Durable synthetic fixtures for OfferPSP golden-path verification.
-- The registry is private and enforces scenario isolation at the matching and
-- shortlist boundaries, so a QA PSP can never leak into a real merchant flow.

create table if not exists private.offerpsp_qa_fixture_entities (
  scenario_key text not null,
  entity_type text not null,
  entity_id uuid not null,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (scenario_key, entity_type, entity_id),
  unique (entity_type, entity_id),
  constraint offerpsp_qa_fixture_scenario_key_check
    check (scenario_key ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  constraint offerpsp_qa_fixture_entity_type_check
    check (entity_type in ('merchant', 'provider'))
);

create index if not exists offerpsp_qa_fixture_scenario_idx
  on private.offerpsp_qa_fixture_entities (scenario_key, entity_type);

create or replace function private.offerpsp_qa_scenario_for_entity(
  p_entity_type text,
  p_entity_id uuid
)
returns text
language sql
stable
security definer
set search_path = private, pg_catalog
as $$
  select scenario_key
  from private.offerpsp_qa_fixture_entities
  where entity_type = p_entity_type
    and entity_id = p_entity_id;
$$;

create or replace function private.offerpsp_qa_pair_is_compatible(
  p_lead_id uuid,
  p_provider_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = private, pg_catalog
as $$
declare
  v_merchant_scenario text;
  v_provider_scenario text;
begin
  v_merchant_scenario := private.offerpsp_qa_scenario_for_entity('merchant', p_lead_id);
  v_provider_scenario := private.offerpsp_qa_scenario_for_entity('provider', p_provider_id);
  return (v_merchant_scenario is null and v_provider_scenario is null)
    or (v_merchant_scenario is not null and v_merchant_scenario = v_provider_scenario);
end;
$$;

create or replace function private.offerpsp_enforce_route_match_qa_scenario()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_scenario text;
begin
  if not private.offerpsp_qa_pair_is_compatible(new.lead_id, new.provider_id) then
    return null;
  end if;
  v_scenario := private.offerpsp_qa_scenario_for_entity('merchant', new.lead_id);
  if v_scenario is not null then
    new.hard_gates := coalesce(new.hard_gates, '{}'::jsonb)
      || jsonb_build_object('qa_scenario', true, 'qa_scenario_key', v_scenario);
  end if;
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_enforce_route_match_qa_scenario on private.offerpsp_route_matches;
create trigger tg_offerpsp_enforce_route_match_qa_scenario
before insert or update of lead_id, provider_id, route_id
on private.offerpsp_route_matches
for each row execute function private.offerpsp_enforce_route_match_qa_scenario();

create or replace function private.offerpsp_enforce_shortlist_qa_scenario()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead_id uuid;
  v_provider_id uuid;
begin
  if new.offer_route_id is null then
    return new;
  end if;
  select lead_id into v_lead_id
  from public.offerpsp_shortlists
  where id = new.shortlist_id;
  select provider_id into v_provider_id
  from private.offerpsp_offer_routes
  where id = new.offer_route_id;
  if not private.offerpsp_qa_pair_is_compatible(v_lead_id, v_provider_id) then
    raise exception 'QA fixture and production entities cannot share a shortlist';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_offerpsp_enforce_shortlist_qa_scenario on public.offerpsp_shortlist_items;
create trigger tg_offerpsp_enforce_shortlist_qa_scenario
before insert or update of shortlist_id, offer_route_id
on public.offerpsp_shortlist_items
for each row execute function private.offerpsp_enforce_shortlist_qa_scenario();

create or replace function public.save_offerpsp_qa_fixture(
  p_scenario_key text,
  p_entity_type text,
  p_entity_id uuid,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_scenario text := lower(trim(coalesce(p_scenario_key, '')));
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if v_scenario !~ '^[a-z0-9][a-z0-9_-]{2,63}$' then
    raise exception 'Unsupported QA scenario key';
  end if;
  if p_entity_type = 'merchant' then
    if not exists (select 1 from public.offerpsp_leads where lead_id = p_entity_id) then
      raise exception 'OfferPSP merchant not found';
    end if;
  elsif p_entity_type = 'provider' then
    if not exists (select 1 from private.offerpsp_providers where id = p_entity_id) then
      raise exception 'OfferPSP provider not found';
    end if;
  else
    raise exception 'Unsupported QA fixture entity type';
  end if;

  insert into private.offerpsp_qa_fixture_entities(
    scenario_key, entity_type, entity_id, label, created_by
  ) values (
    v_scenario, p_entity_type, p_entity_id, nullif(trim(p_label), ''), auth.uid()
  )
  on conflict (entity_type, entity_id)
  do update set
    scenario_key = excluded.scenario_key,
    label = excluded.label,
    created_by = excluded.created_by,
    created_at = now();

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, after_state
  ) values (
    p_entity_type, p_entity_id::text, 'qa_fixture_registered', auth.uid(),
    jsonb_build_object('scenario_key', v_scenario, 'label', nullif(trim(p_label), ''))
  );

  return jsonb_build_object(
    'scenario_key', v_scenario,
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'label', nullif(trim(p_label), '')
  );
end;
$$;

create or replace function public.list_offerpsp_qa_fixture_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  return coalesce((
    select jsonb_agg(scenario_payload order by scenario_key)
    from (
      select
        fixture.scenario_key,
        jsonb_build_object(
          'scenario_key', fixture.scenario_key,
          'merchant_count', count(*) filter (where fixture.entity_type = 'merchant'),
          'provider_count', count(*) filter (where fixture.entity_type = 'provider'),
          'published_route_count', (
            select count(*)
            from private.offerpsp_offer_routes route
            where route.status = 'published'
              and route.provider_id in (
                select provider_fixture.entity_id
                from private.offerpsp_qa_fixture_entities provider_fixture
                where provider_fixture.scenario_key = fixture.scenario_key
                  and provider_fixture.entity_type = 'provider'
              )
          ),
          'eligible_match_count', (
            select count(*)
            from private.offerpsp_route_matches route_match
            where route_match.eligibility = 'eligible'
              and route_match.lead_id in (
                select merchant_fixture.entity_id
                from private.offerpsp_qa_fixture_entities merchant_fixture
                where merchant_fixture.scenario_key = fixture.scenario_key
                  and merchant_fixture.entity_type = 'merchant'
              )
          ),
          'entities', jsonb_agg(jsonb_build_object(
            'entity_type', fixture.entity_type,
            'entity_id', fixture.entity_id,
            'label', fixture.label
          ) order by fixture.entity_type, fixture.label)
        ) as scenario_payload
      from private.offerpsp_qa_fixture_entities fixture
      group by fixture.scenario_key
    ) scenarios
  ), '[]'::jsonb);
end;
$$;

delete from private.offerpsp_route_matches route_match
where not private.offerpsp_qa_pair_is_compatible(route_match.lead_id, route_match.provider_id);

revoke all on table private.offerpsp_qa_fixture_entities from public, anon, authenticated;
grant all on table private.offerpsp_qa_fixture_entities to service_role;

revoke all on function private.offerpsp_qa_scenario_for_entity(text, uuid) from public, anon, authenticated;
revoke all on function private.offerpsp_qa_pair_is_compatible(uuid, uuid) from public, anon, authenticated;
revoke all on function private.offerpsp_enforce_route_match_qa_scenario() from public, anon, authenticated;
revoke all on function private.offerpsp_enforce_shortlist_qa_scenario() from public, anon, authenticated;
grant execute on function private.offerpsp_qa_scenario_for_entity(text, uuid) to service_role;
grant execute on function private.offerpsp_qa_pair_is_compatible(uuid, uuid) to service_role;
grant execute on function private.offerpsp_enforce_route_match_qa_scenario() to service_role;
grant execute on function private.offerpsp_enforce_shortlist_qa_scenario() to service_role;

revoke all on function public.save_offerpsp_qa_fixture(text, text, uuid, text) from public, anon;
revoke all on function public.list_offerpsp_qa_fixture_status() from public, anon;
grant execute on function public.save_offerpsp_qa_fixture(text, text, uuid, text) to authenticated, service_role;
grant execute on function public.list_offerpsp_qa_fixture_status() to authenticated, service_role;

comment on table private.offerpsp_qa_fixture_entities is
  'Private registry of synthetic golden-path entities. Matching and shortlist triggers isolate each QA scenario from production.';
