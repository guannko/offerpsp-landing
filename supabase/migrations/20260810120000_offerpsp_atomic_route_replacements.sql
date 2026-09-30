-- OfferPSP: atomic route identity and staff-confirmed replacements.
-- A source document is only a container. One normalized route is the smallest
-- replaceable unit; omitted siblings are never retired automatically.

alter table private.offerpsp_offer_routes
  add column if not exists coverage_mode text,
  add column if not exists route_family_id uuid,
  add column if not exists route_family_key text;

update private.offerpsp_offer_routes
set coverage_mode = case
  when niche_key like 'GEO:ALLOWLIST|%' then 'allowlist'
  when niche_key like 'GEO:GLOBAL_EXCEPT|%' then 'global_except'
  when coverage_scope = 'global' then 'global_except'
  when coverage_scope = 'regional' then 'regional'
  else 'specific'
end
where coverage_mode is null;

update private.offerpsp_offer_routes
set route_family_id = gen_random_uuid()
where route_family_id is null;

alter table private.offerpsp_offer_routes
  alter column coverage_mode set default 'specific',
  alter column coverage_mode set not null,
  alter column route_family_id set default gen_random_uuid(),
  alter column route_family_id set not null;

-- A durable family UUID and a computed similarity key are routing metadata,
-- not commercial terms. They must not make a commercially identical revision
-- look changed merely because it entered review as a new atomic route.
create or replace function private.offerpsp_route_commercial_fingerprint(p_route_id uuid)
returns text
language sql
stable
set search_path = public, private, pg_catalog
as $$
  select md5(jsonb_build_object(
    'route', to_jsonb(r)
      - 'id' - 'provider_id' - 'batch_id' - 'internal_code'
      - 'status' - 'revision_of_route_id' - 'route_family_id' - 'route_family_key'
      - 'niche_key' - 'effective_from' - 'expires_at' - 'freshness_days'
      - 'raw_block' - 'created_at' - 'updated_at',
    'fees', coalesce((
      select jsonb_agg(to_jsonb(f) - 'id' - 'route_id' - 'created_at' order by f.flow, f.fee_type, f.created_at)
      from private.offerpsp_offer_fee_components f where f.route_id = r.id
    ), '[]'::jsonb),
    'limits', coalesce((
      select jsonb_agg(to_jsonb(l) - 'id' - 'route_id' - 'created_at' order by l.flow, l.currency, l.created_at)
      from private.offerpsp_offer_limits l where l.route_id = r.id
    ), '[]'::jsonb),
    'settlement', coalesce((
      select jsonb_agg(to_jsonb(s) - 'id' - 'route_id' - 'created_at' order by s.currency, s.period, s.created_at)
      from private.offerpsp_settlement_terms s where s.route_id = r.id
    ), '[]'::jsonb)
  )::text)
  from private.offerpsp_offer_routes r
  where r.id = p_route_id;
$$;

revoke all on function private.offerpsp_route_commercial_fingerprint(uuid)
  from public, anon, authenticated;

alter table private.offerpsp_offer_routes
  drop constraint if exists offerpsp_offer_routes_coverage_mode_check;
alter table private.offerpsp_offer_routes
  add constraint offerpsp_offer_routes_coverage_mode_check
  check (coverage_mode in ('specific', 'regional', 'allowlist', 'global_except'));

create or replace function private.offerpsp_sorted_identity_part(
  p_values text[],
  p_fallback text default 'ANY'
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    string_agg(distinct upper(trim(value)), '+' order by upper(trim(value)))
      filter (where nullif(trim(value), '') is not null),
    p_fallback
  )
  from unnest(coalesce(p_values, '{}'::text[])) value;
$$;

revoke all on function private.offerpsp_sorted_identity_part(text[], text)
  from public, anon, authenticated;

create or replace function private.offerpsp_route_family_key(
  p_coverage_mode text,
  p_geos text[],
  p_currencies text[],
  p_flow text,
  p_methods text[],
  p_card_brands text[],
  p_traffic_types text[],
  p_integrations text[]
)
returns text
language sql
immutable
set search_path = private, pg_catalog
as $$
  select concat_ws('|',
    'GEO:' || case
      when p_coverage_mode in ('allowlist', 'global_except') then upper(p_coverage_mode)
      else private.offerpsp_sorted_identity_part(p_geos, 'UNKNOWN')
    end,
    'CURRENCY:' || private.offerpsp_sorted_identity_part(p_currencies, 'UNKNOWN'),
    'FLOW:' || upper(coalesce(nullif(trim(p_flow), ''), 'both')),
    'METHOD:' || private.offerpsp_sorted_identity_part(p_methods, 'UNKNOWN'),
    'SCHEME:' || private.offerpsp_sorted_identity_part(p_card_brands, 'ANY'),
    'TRAFFIC:' || private.offerpsp_sorted_identity_part(p_traffic_types, 'ANY'),
    'INTEGRATION:' || private.offerpsp_sorted_identity_part(p_integrations, 'ANY')
  );
$$;

revoke all on function private.offerpsp_route_family_key(text, text[], text[], text, text[], text[], text[], text[])
  from public, anon, authenticated;

create or replace function private.tg_offerpsp_route_identity()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
begin
  if new.revision_of_route_id is not null then
    select route_family_id into new.route_family_id
    from private.offerpsp_offer_routes
    where id = new.revision_of_route_id;
  elsif new.route_family_id is null then
    new.route_family_id := gen_random_uuid();
  end if;

  if new.niche_key like 'GEO:ALLOWLIST|%' then
    new.coverage_mode := 'allowlist';
  elsif new.niche_key like 'GEO:GLOBAL_EXCEPT|%' then
    new.coverage_mode := 'global_except';
  elsif new.coverage_mode is null then
    new.coverage_mode := case
      when new.coverage_scope = 'global' then 'global_except'
      when new.coverage_scope = 'regional' then 'regional'
      else 'specific'
    end;
  end if;

  new.coverage_scope := case
    when new.coverage_mode = 'global_except' then 'global'
    when new.coverage_mode in ('regional', 'allowlist') then 'regional'
    else 'specific'
  end;
  new.geos := coalesce(new.geos, '{}'::text[]);
  new.blocked_geos := coalesce(new.blocked_geos, '{}'::text[]);
  new.card_brands := coalesce(new.card_brands, '{}'::text[]);
  new.route_family_key := private.offerpsp_route_family_key(
    new.coverage_mode,
    new.geos,
    new.currencies,
    new.flow,
    new.methods,
    new.card_brands,
    new.traffic_types,
    new.integrations
  );
  return new;
end;
$$;

revoke all on function private.tg_offerpsp_route_identity()
  from public, anon, authenticated;

drop trigger if exists tg_offerpsp_route_identity on private.offerpsp_offer_routes;
create trigger tg_offerpsp_route_identity
before insert or update of coverage_scope, coverage_mode, geos, currencies, flow,
  methods, card_brands, traffic_types, integrations, niche_key
on private.offerpsp_offer_routes
for each row execute function private.tg_offerpsp_route_identity();

update private.offerpsp_offer_routes
set route_family_key = private.offerpsp_route_family_key(
  coverage_mode, geos, currencies, flow, methods, card_brands,
  traffic_types, integrations
);

alter table private.offerpsp_offer_routes
  alter column route_family_key set not null;

create index if not exists offerpsp_offer_routes_family_idx
  on private.offerpsp_offer_routes(provider_id, route_family_id, status, created_at desc);
create index if not exists offerpsp_offer_routes_similarity_idx
  on private.offerpsp_offer_routes(provider_id, route_family_key, status, created_at desc);

create table if not exists private.offerpsp_route_replacement_reviews (
  id uuid primary key default gen_random_uuid(),
  new_route_id uuid not null unique
    references private.offerpsp_offer_routes(id) on delete cascade,
  candidate_route_id uuid
    references private.offerpsp_offer_routes(id) on delete set null,
  candidate_route_ids uuid[] not null default '{}',
  candidate_count integer not null default 0 check (candidate_count >= 0),
  status text not null
    check (status in ('pending', 'confirmed', 'independent')),
  confidence text not null
    check (confidence in ('exact', 'ambiguous', 'none', 'manual')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.offerpsp_route_replacement_reviews
  from public, anon, authenticated;

create index if not exists offerpsp_route_replacement_candidate_idx
  on private.offerpsp_route_replacement_reviews(candidate_route_id)
  where candidate_route_id is not null;

create or replace function private.offerpsp_refresh_route_replacement_review(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
declare
  v_route private.offerpsp_offer_routes;
  v_revision private.offerpsp_offer_routes;
  v_candidates uuid[] := '{}'::uuid[];
  v_count integer := 0;
  v_exact_count integer := 0;
  v_status text;
  v_confidence text;
  v_candidate uuid;
begin
  select * into v_route
  from private.offerpsp_offer_routes
  where id = p_route_id;
  if not found or v_route.status not in ('draft', 'review') then return; end if;

  if v_route.revision_of_route_id is not null then
    select * into v_revision
    from private.offerpsp_offer_routes
    where id = v_route.revision_of_route_id;
  end if;

  if v_revision.id is not null
     and v_revision.provider_id = v_route.provider_id
     and cardinality(v_revision.methods) > 0
     and v_revision.methods && v_route.methods then
    v_candidates := array[v_revision.id];
    v_count := 1;
    v_candidate := v_revision.id;
    v_status := 'confirmed';
    v_confidence := 'manual';
  else
    select coalesce(array_agg(candidate.id order by
      case when candidate.route_family_key = v_route.route_family_key then 0 else 1 end,
      case candidate.status when 'published' then 0 else 1 end,
      candidate.created_at desc), '{}'::uuid[])
    into v_candidates
    from private.offerpsp_offer_routes candidate
    where candidate.provider_id = v_route.provider_id
      and candidate.id <> v_route.id
      and candidate.status in ('published', 'paused')
      and cardinality(candidate.methods) > 0
      and candidate.methods && v_route.methods;

    select count(*)
    into v_exact_count
    from private.offerpsp_offer_routes candidate
    where candidate.provider_id = v_route.provider_id
      and candidate.id <> v_route.id
      and candidate.route_family_key = v_route.route_family_key
      and candidate.status in ('published', 'paused');

    v_count := cardinality(v_candidates);
    v_candidate := case when v_count = 1 or v_exact_count = 1 then v_candidates[1] else null end;
    v_status := case when v_count = 0 then 'independent' else 'pending' end;
    v_confidence := case
      when v_count = 0 then 'none'
      when v_exact_count = 1 then 'exact'
      else 'ambiguous'
    end;
  end if;

  insert into private.offerpsp_route_replacement_reviews(
    new_route_id, candidate_route_id, candidate_route_ids, candidate_count,
    status, confidence, reviewed_by, reviewed_at, updated_at
  ) values (
    v_route.id, v_candidate, v_candidates, v_count, v_status, v_confidence,
    case when v_status = 'confirmed' then auth.uid() else null end,
    case when v_status = 'confirmed' then now() else null end,
    now()
  )
  on conflict (new_route_id) do update
  set candidate_route_id = excluded.candidate_route_id,
      candidate_route_ids = excluded.candidate_route_ids,
      candidate_count = excluded.candidate_count,
      status = excluded.status,
      confidence = excluded.confidence,
      reviewed_by = excluded.reviewed_by,
      reviewed_at = excluded.reviewed_at,
      updated_at = now();

  if v_status <> 'confirmed' and v_route.revision_of_route_id is not null then
    update private.offerpsp_offer_routes
    set revision_of_route_id = null,
        route_family_id = gen_random_uuid()
    where id = v_route.id;
  end if;
end;
$$;

revoke all on function private.offerpsp_refresh_route_replacement_review(uuid)
  from public, anon, authenticated;

create or replace function private.tg_offerpsp_refresh_route_replacement_review()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
begin
  perform private.offerpsp_refresh_route_replacement_review(new.id);
  return new;
end;
$$;

revoke all on function private.tg_offerpsp_refresh_route_replacement_review()
  from public, anon, authenticated;

drop trigger if exists tg_offerpsp_refresh_route_replacement_review on private.offerpsp_offer_routes;
create trigger tg_offerpsp_refresh_route_replacement_review
after insert or update of coverage_scope, coverage_mode, geos, currencies, flow,
  methods, card_brands, traffic_types, integrations
on private.offerpsp_offer_routes
for each row execute function private.tg_offerpsp_refresh_route_replacement_review();

do $$
declare v_route_id uuid;
begin
  for v_route_id in
    select id from private.offerpsp_offer_routes where status in ('draft', 'review')
  loop
    perform private.offerpsp_refresh_route_replacement_review(v_route_id);
  end loop;
end;
$$;

-- The legacy importer proposes revision_of_route_id immediately after insert.
-- Keep the proposal in the review table, but never allow it to become a real
-- replacement before an explicit staff decision.
create or replace function private.tg_offerpsp_guard_revision_link()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
declare v_review_status text;
begin
  if old.revision_of_route_id is null and new.revision_of_route_id is not null then
    select status into v_review_status
    from private.offerpsp_route_replacement_reviews
    where new_route_id = new.id;
    if coalesce(v_review_status, 'pending') <> 'confirmed' then
      new.revision_of_route_id := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.tg_offerpsp_guard_revision_link()
  from public, anon, authenticated;

drop trigger if exists tg_offerpsp_guard_revision_link on private.offerpsp_offer_routes;
create trigger tg_offerpsp_guard_revision_link
before update of revision_of_route_id on private.offerpsp_offer_routes
for each row execute function private.tg_offerpsp_guard_revision_link();

create or replace function private.tg_offerpsp_guard_route_publication()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
declare v_review_status text;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if new.coverage_mode in ('specific', 'regional', 'allowlist')
       and cardinality(new.geos) = 0 then
      raise exception 'This coverage mode requires at least one GEO'
        using errcode = 'P0001';
    end if;
    select status into v_review_status
    from private.offerpsp_route_replacement_reviews
    where new_route_id = new.id;
    if v_review_status = 'pending' then
      raise exception 'Choose whether this route replaces a candidate or is a new independent route'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.tg_offerpsp_guard_route_publication()
  from public, anon, authenticated;

drop trigger if exists tg_offerpsp_guard_route_publication on private.offerpsp_offer_routes;
create trigger tg_offerpsp_guard_route_publication
before update of status on private.offerpsp_offer_routes
for each row execute function private.tg_offerpsp_guard_route_publication();

create or replace function public.get_offerpsp_route_replacement_review(p_route_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare v_route private.offerpsp_offer_routes;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  select * into v_route from private.offerpsp_offer_routes where id = p_route_id;
  if not found then raise exception 'OfferPSP route not found'; end if;

  return jsonb_build_object(
    'route', to_jsonb(v_route) - 'raw_block',
    'review', coalesce((
      select to_jsonb(review)
      from private.offerpsp_route_replacement_reviews review
      where review.new_route_id = p_route_id
    ), '{}'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', candidate.id,
        'internal_code', candidate.internal_code,
        'client_title', candidate.client_title,
        'status', candidate.status,
        'coverage_mode', candidate.coverage_mode,
        'geos', candidate.geos,
        'blocked_geos', candidate.blocked_geos,
        'currencies', candidate.currencies,
        'flow', candidate.flow,
        'methods', candidate.methods,
        'card_brands', candidate.card_brands,
        'traffic_types', candidate.traffic_types,
        'integrations', candidate.integrations,
        'commercial_changed', private.offerpsp_route_commercial_fingerprint(candidate.id)
          is distinct from private.offerpsp_route_commercial_fingerprint(v_route.id)
      ) order by candidate.created_at desc)
      from private.offerpsp_route_replacement_reviews review
      join private.offerpsp_offer_routes candidate
        on candidate.id = any(review.candidate_route_ids)
      where review.new_route_id = p_route_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.decide_offerpsp_route_replacement(
  p_new_route_id uuid,
  p_decision text,
  p_candidate_route_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_new private.offerpsp_offer_routes;
  v_old private.offerpsp_offer_routes;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  select * into v_new from private.offerpsp_offer_routes
  where id = p_new_route_id for update;
  if not found then raise exception 'New route not found'; end if;
  if v_new.status not in ('draft', 'review') then
    raise exception 'Only a draft or review route can be classified';
  end if;

  if p_decision = 'independent' then
    update private.offerpsp_route_replacement_reviews
    set status = 'independent', confidence = 'manual', candidate_route_id = null,
        reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where new_route_id = p_new_route_id;
    update private.offerpsp_offer_routes
    set revision_of_route_id = null, updated_at = now()
    where id = p_new_route_id;
  elsif p_decision = 'replace' then
    if p_candidate_route_id is null then
      raise exception 'Candidate route is required for replacement';
    end if;
    select * into v_old from private.offerpsp_offer_routes
    where id = p_candidate_route_id and status in ('published', 'paused')
    for update;
    if not found then raise exception 'Active candidate route not found'; end if;
    if v_old.provider_id <> v_new.provider_id
       or cardinality(v_old.methods) = 0
       or not (v_old.methods && v_new.methods) then
      raise exception 'Candidate must belong to the same PSP and payment-method family'
        using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from private.offerpsp_route_replacement_reviews review
      where review.new_route_id = p_new_route_id
        and p_candidate_route_id = any(review.candidate_route_ids)
    ) then
      raise exception 'Candidate is not part of the prepared replacement review'
        using errcode = 'P0001';
    end if;
    update private.offerpsp_route_replacement_reviews
    set status = 'confirmed', confidence = 'manual',
        candidate_route_id = p_candidate_route_id,
        reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where new_route_id = p_new_route_id;
    update private.offerpsp_offer_routes
    set revision_of_route_id = p_candidate_route_id,
        route_family_id = v_old.route_family_id,
        updated_at = now()
    where id = p_new_route_id;
  else
    raise exception 'Decision must be replace or independent';
  end if;

  insert into private.offerpsp_supply_activities(
    provider_id, route_id, batch_id, actor_user_id, action_type, summary, after_state
  ) values (
    v_new.provider_id, v_new.id, v_new.batch_id, auth.uid(),
    'route_replacement_decided',
    case when p_decision = 'replace'
      then 'Atomic route replacement confirmed'
      else 'Route classified as independent' end,
    jsonb_build_object('decision', p_decision, 'candidate_route_id', p_candidate_route_id)
  );

  return public.get_offerpsp_route_replacement_review(p_new_route_id);
end;
$$;

create or replace function public.save_offerpsp_route_v2(
  p_route_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_mode text;
  v_scope text;
  v_result jsonb;
  v_route private.offerpsp_offer_routes;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  select * into v_route from private.offerpsp_offer_routes where id = p_route_id;
  if not found then raise exception 'OfferPSP route not found'; end if;
  v_mode := coalesce(nullif(lower(trim(p_payload ->> 'coverage_mode')), ''), v_route.coverage_mode);
  if v_mode not in ('specific', 'regional', 'allowlist', 'global_except') then
    raise exception 'Unsupported coverage mode';
  end if;
  v_scope := case
    when v_mode = 'global_except' then 'global'
    when v_mode in ('regional', 'allowlist') then 'regional'
    else 'specific'
  end;

  v_result := public.save_offerpsp_route(
    p_route_id,
    coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('coverage_scope', v_scope)
  );

  update private.offerpsp_offer_routes
  set coverage_mode = v_mode,
      coverage_scope = v_scope,
      card_brands = case when p_payload ? 'card_brands'
        then private.offerpsp_jsonb_text_array(p_payload -> 'card_brands')
        else card_brands end,
      updated_at = now()
  where id = p_route_id
  returning * into v_route;

  perform private.offerpsp_refresh_route_replacement_review(p_route_id);
  return to_jsonb(v_route) - 'raw_block';
end;
$$;

create or replace function private.offerpsp_validate_route_replacement(
  p_old_route_id uuid,
  p_new_route_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
declare
  v_old private.offerpsp_offer_routes;
  v_new private.offerpsp_offer_routes;
begin
  select * into v_old from private.offerpsp_offer_routes where id = p_old_route_id;
  if not found then raise exception 'Original route not found' using errcode = 'P0001'; end if;
  select * into v_new from private.offerpsp_offer_routes where id = p_new_route_id;
  if not found then raise exception 'Replacement route not found' using errcode = 'P0001'; end if;
  if v_new.status <> 'published' then
    raise exception 'Replacement route must be published (current status: %)', v_new.status
      using errcode = 'P0001';
  end if;
  if v_old.provider_id <> v_new.provider_id
     or v_old.route_family_id <> v_new.route_family_id then
    raise exception 'Incompatible replacement: staff did not confirm the same route lineage'
      using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'compatible', true,
    'atomic_family_match', true,
    'route_family_id', v_new.route_family_id,
    'old_similarity_key', v_old.route_family_key,
    'new_similarity_key', v_new.route_family_key
  );
end;
$$;

revoke all on function public.get_offerpsp_route_replacement_review(uuid)
  from public, anon;
revoke all on function public.decide_offerpsp_route_replacement(uuid, text, uuid)
  from public, anon;
revoke all on function public.save_offerpsp_route_v2(uuid, jsonb)
  from public, anon;
revoke all on function private.offerpsp_validate_route_replacement(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.get_offerpsp_route_replacement_review(uuid)
  to authenticated;
grant execute on function public.decide_offerpsp_route_replacement(uuid, text, uuid)
  to authenticated;
grant execute on function public.save_offerpsp_route_v2(uuid, jsonb)
  to authenticated;
