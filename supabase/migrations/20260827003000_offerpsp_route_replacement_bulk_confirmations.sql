-- Two-phase, staff-session-bound bulk replacement for normalized PSP routes.
-- Preparation records an immutable snapshot. Confirmation revalidates every
-- route and component before applying the existing per-route lifecycle calls
-- inside one database transaction.

create table if not exists private.offerpsp_route_replacement_confirmations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  actor_session_id text not null check (length(actor_session_id) between 1 and 180),
  provider_id uuid not null references private.offerpsp_providers(id) on delete cascade,
  pairs jsonb not null check (
    jsonb_typeof(pairs) = 'array'
    and jsonb_array_length(pairs) between 1 and 50
  ),
  preview jsonb not null check (jsonb_typeof(preview) = 'array'),
  status text not null default 'pending'
    check (status in ('pending', 'executed', 'cancelled', 'expired')),
  result jsonb,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists offerpsp_route_replacement_confirmations_pending_idx
  on private.offerpsp_route_replacement_confirmations (
    actor_user_id,
    actor_session_id,
    created_at desc
  )
  where status = 'pending';

create index if not exists offerpsp_route_replacement_confirmations_provider_idx
  on private.offerpsp_route_replacement_confirmations (provider_id, created_at desc);

create index if not exists offerpsp_route_replacement_confirmations_actor_idx
  on private.offerpsp_route_replacement_confirmations (actor_user_id, created_at desc);

revoke all on table private.offerpsp_route_replacement_confirmations
  from public, anon, authenticated, service_role;

create or replace function private.offerpsp_confirmation_session_id()
returns text
language sql
stable
security invoker
set search_path = pg_catalog, auth
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'session_id', ''),
    'user:' || coalesce(auth.uid()::text, 'anonymous')
  );
$$;

revoke all on function private.offerpsp_confirmation_session_id()
  from public, anon, authenticated, service_role;

create or replace function private.offerpsp_route_replacement_snapshot(p_route_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'route_id', route.id,
    'internal_code', route.internal_code,
    'provider_id', route.provider_id,
    'batch_id', route.batch_id,
    'batch_status', batch.status,
    'status', route.status,
    'client_title', route.client_title,
    'coverage_mode', route.coverage_mode,
    'geos', route.geos,
    'blocked_geos', route.blocked_geos,
    'currencies', route.currencies,
    'flow', route.flow,
    'methods', route.methods,
    'card_brands', route.card_brands,
    'traffic_types', route.traffic_types,
    'verticals', route.verticals,
    'integrations', route.integrations,
    'revision_of_route_id', route.revision_of_route_id,
    'route_family_id', route.route_family_id,
    'route_family_key', route.route_family_key,
    'updated_at', route.updated_at,
    'commercial_fingerprint', private.offerpsp_route_commercial_fingerprint(route.id),
    'fees', coalesce((
      select jsonb_agg(
        to_jsonb(fee) - 'id' - 'route_id' - 'created_at'
        order by fee.flow, fee.fee_type, fee.created_at, fee.id
      )
      from private.offerpsp_offer_fee_components fee
      where fee.route_id = route.id
    ), '[]'::jsonb),
    'limits', coalesce((
      select jsonb_agg(
        to_jsonb(lim) - 'id' - 'route_id' - 'created_at'
        order by lim.flow, lim.currency, lim.created_at, lim.id
      )
      from private.offerpsp_offer_limits lim
      where lim.route_id = route.id
    ), '[]'::jsonb),
    'settlements', coalesce((
      select jsonb_agg(
        to_jsonb(term) - 'id' - 'route_id' - 'created_at'
        order by term.currency, term.period, term.created_at, term.id
      )
      from private.offerpsp_settlement_terms term
      where term.route_id = route.id
    ), '[]'::jsonb),
    'anomalies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'anomaly_code', anomaly.anomaly_code,
        'severity', anomaly.severity,
        'field_name', anomaly.field_name,
        'status', anomaly.status,
        'resolution_note', anomaly.resolution_note,
        'resolved_at', anomaly.resolved_at
      ) order by anomaly.anomaly_code, anomaly.created_at, anomaly.id)
      from private.offerpsp_route_anomalies anomaly
      where anomaly.route_id = route.id
    ), '[]'::jsonb),
    'replacement_review', coalesce((
      select jsonb_build_object(
        'status', review.status,
        'confidence', review.confidence,
        'candidate_route_id', review.candidate_route_id,
        'candidate_route_ids', review.candidate_route_ids,
        'updated_at', review.updated_at
      )
      from private.offerpsp_route_replacement_reviews review
      where review.new_route_id = route.id
    ), '{}'::jsonb)
  )
  from private.offerpsp_offer_routes route
  join private.offerpsp_rate_card_batches batch on batch.id = route.batch_id
  where route.id = p_route_id;
$$;

revoke all on function private.offerpsp_route_replacement_snapshot(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.prepare_offerpsp_route_replacements(p_pairs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_session_id text := private.offerpsp_confirmation_session_id();
  v_item jsonb;
  v_old_code text;
  v_new_code text;
  v_old private.offerpsp_offer_routes;
  v_new private.offerpsp_offer_routes;
  v_review private.offerpsp_route_replacement_reviews;
  v_provider private.offerpsp_providers;
  v_provider_id uuid;
  v_old_ids uuid[] := '{}'::uuid[];
  v_new_ids uuid[] := '{}'::uuid[];
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
  v_normalized_pairs jsonb := '[]'::jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_confirmation private.offerpsp_route_replacement_confirmations;
begin
  if not public.is_offerpsp_staff() or v_actor_user_id is null then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' then
    raise exception 'Route replacement pairs must be an array';
  end if;
  if jsonb_array_length(p_pairs) not between 1 and 50 then
    raise exception 'Route replacement preview requires 1 to 50 pairs';
  end if;

  for v_item in select value from jsonb_array_elements(p_pairs)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Every route replacement pair must be an object';
    end if;
    v_old_code := upper(trim(coalesce(v_item ->> 'published_route_code', '')));
    v_new_code := upper(trim(coalesce(v_item ->> 'draft_route_code', '')));
    if v_old_code !~ '^OFF-[0-9]{6}$' or v_new_code !~ '^OFF-[0-9]{6}$' then
      raise exception 'Each pair requires valid published_route_code and draft_route_code';
    end if;

    select * into v_old
    from private.offerpsp_offer_routes
    where internal_code = v_old_code;
    if not found then raise exception 'Published route % was not found', v_old_code; end if;

    select * into v_new
    from private.offerpsp_offer_routes
    where internal_code = v_new_code;
    if not found then raise exception 'Draft route % was not found', v_new_code; end if;

    if v_old.id = v_new.id then raise exception 'A route cannot replace itself'; end if;
    if v_old.id = any(v_old_ids) or v_new.id = any(v_new_ids) then
      raise exception 'Duplicate route in replacement preview';
    end if;
    if v_old.status <> 'published' then
      raise exception 'Route % must currently be published (status: %)', v_old_code, v_old.status;
    end if;
    if v_new.status not in ('draft', 'review') then
      raise exception 'Route % must currently be draft or review (status: %)', v_new_code, v_new.status;
    end if;
    if v_old.provider_id <> v_new.provider_id then
      raise exception 'Replacement pair % -> % belongs to different PSPs', v_old_code, v_new_code;
    end if;
    if v_old.batch_id = v_new.batch_id then
      raise exception 'Replacement pair % -> % must use different rate-card versions', v_old_code, v_new_code;
    end if;
    if v_provider_id is null then
      v_provider_id := v_old.provider_id;
    elsif v_provider_id <> v_old.provider_id then
      raise exception 'One preview may replace routes for only one PSP';
    end if;

    select * into v_review
    from private.offerpsp_route_replacement_reviews
    where new_route_id = v_new.id;
    if not found or not (v_old.id = any(v_review.candidate_route_ids)) then
      raise exception 'Route % is not a prepared replacement candidate for %', v_old_code, v_new_code;
    end if;

    v_old_snapshot := private.offerpsp_route_replacement_snapshot(v_old.id);
    v_new_snapshot := private.offerpsp_route_replacement_snapshot(v_new.id);
    v_old_ids := array_append(v_old_ids, v_old.id);
    v_new_ids := array_append(v_new_ids, v_new.id);
    v_normalized_pairs := v_normalized_pairs || jsonb_build_array(jsonb_build_object(
      'published_route_id', v_old.id,
      'published_route_code', v_old.internal_code,
      'draft_route_id', v_new.id,
      'draft_route_code', v_new.internal_code,
      'published_snapshot', v_old_snapshot,
      'draft_snapshot', v_new_snapshot
    ));
    v_preview := v_preview || jsonb_build_array(jsonb_build_object(
      'published_route', v_old_snapshot,
      'draft_route', v_new_snapshot,
      'effect', jsonb_build_object(
        'published_route_status', 'archived',
        'draft_route_status', 'published',
        'commercial_changed',
          private.offerpsp_route_commercial_fingerprint(v_old.id)
            is distinct from private.offerpsp_route_commercial_fingerprint(v_new.id)
      )
    ));
  end loop;

  select * into v_provider
  from private.offerpsp_providers
  where id = v_provider_id;

  update private.offerpsp_route_replacement_confirmations
  set status = 'expired'
  where actor_user_id = v_actor_user_id
    and actor_session_id = v_actor_session_id
    and status = 'pending'
    and expires_at <= now();

  select * into v_confirmation
  from private.offerpsp_route_replacement_confirmations
  where actor_user_id = v_actor_user_id
    and actor_session_id = v_actor_session_id
    and provider_id = v_provider_id
    and status = 'pending'
    and expires_at > now()
    and pairs = v_normalized_pairs
  order by created_at desc
  limit 1;

  if not found then
    insert into private.offerpsp_route_replacement_confirmations(
      actor_user_id, actor_session_id, provider_id, pairs, preview
    ) values (
      v_actor_user_id, v_actor_session_id, v_provider_id,
      v_normalized_pairs, v_preview
    )
    returning * into v_confirmation;
  end if;

  return jsonb_build_object(
    'handled', true,
    'confirmation_required', true,
    'confirmation_token', v_confirmation.id,
    'status', v_confirmation.status,
    'operation', 'replace_offer_routes',
    'provider', jsonb_build_object(
      'id', v_provider.id,
      'internal_code', v_provider.internal_code,
      'brand_name', v_provider.brand_name
    ),
    'count', jsonb_array_length(v_confirmation.pairs),
    'items', v_confirmation.preview,
    'expires_at', v_confirmation.expires_at,
    'instruction', 'Ask Boris to confirm this exact token-bound preview. Do not execute it yet.'
  );
end;
$$;

create or replace function public.confirm_offerpsp_route_replacements(
  p_confirmation_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_actor_session_id text := private.offerpsp_confirmation_session_id();
  v_confirmation private.offerpsp_route_replacement_confirmations;
  v_item jsonb;
  v_old private.offerpsp_offer_routes;
  v_new private.offerpsp_offer_routes;
  v_route_ids uuid[] := '{}'::uuid[];
  v_lock_id uuid;
  v_publish_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if not public.is_offerpsp_staff() or v_actor_user_id is null then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_confirmation_token is null then
    raise exception 'confirmation_token is required';
  end if;

  select * into v_confirmation
  from private.offerpsp_route_replacement_confirmations
  where id = p_confirmation_token
  for update;

  if not found then
    return jsonb_build_object('handled', false);
  end if;
  if v_confirmation.actor_user_id <> v_actor_user_id
     or v_confirmation.actor_session_id <> v_actor_session_id then
    raise exception 'Confirmation does not belong to this staff session';
  end if;
  if v_confirmation.status = 'executed' then
    return jsonb_build_object(
      'handled', true,
      'confirmation_token', v_confirmation.id,
      'status', 'already_executed',
      'result', v_confirmation.result
    );
  end if;
  if v_confirmation.status <> 'pending' then
    raise exception 'Confirmation is no longer pending (%)', v_confirmation.status;
  end if;
  if v_confirmation.expires_at <= now() then
    update private.offerpsp_route_replacement_confirmations
    set status = 'expired'
    where id = v_confirmation.id;
    return jsonb_build_object(
      'handled', true,
      'confirmation_token', v_confirmation.id,
      'status', 'expired',
      'message', 'Prepare the route replacement preview again.'
    );
  end if;

  for v_item in select value from jsonb_array_elements(v_confirmation.pairs)
  loop
    v_route_ids := array_append(v_route_ids, (v_item ->> 'published_route_id')::uuid);
    v_route_ids := array_append(v_route_ids, (v_item ->> 'draft_route_id')::uuid);
  end loop;

  -- Lock every affected route in one stable order before validation or writes.
  for v_lock_id in
    select id
    from private.offerpsp_offer_routes
    where id = any(v_route_ids)
    order by id
    for update
  loop
    null;
  end loop;

  if (
    select count(*) from private.offerpsp_offer_routes where id = any(v_route_ids)
  ) <> cardinality(v_route_ids) then
    raise exception 'One or more preview routes no longer exist';
  end if;

  -- Validate the complete immutable snapshot before changing the first route.
  for v_item in select value from jsonb_array_elements(v_confirmation.pairs)
  loop
    select * into v_old
    from private.offerpsp_offer_routes
    where id = (v_item ->> 'published_route_id')::uuid;
    select * into v_new
    from private.offerpsp_offer_routes
    where id = (v_item ->> 'draft_route_id')::uuid;

    if v_old.provider_id <> v_confirmation.provider_id
       or v_new.provider_id <> v_confirmation.provider_id then
      raise exception 'Preview provider changed; prepare the operation again';
    end if;
    if v_old.status <> 'published' or v_new.status not in ('draft', 'review') then
      raise exception 'Route lifecycle changed since preview; prepare the operation again';
    end if;
    if private.offerpsp_route_replacement_snapshot(v_old.id)
         is distinct from (v_item -> 'published_snapshot')
       or private.offerpsp_route_replacement_snapshot(v_new.id)
         is distinct from (v_item -> 'draft_snapshot') then
      raise exception 'Route terms or review state changed since preview; prepare the operation again';
    end if;
  end loop;

  -- Existing single-route functions preserve lineage, activity logs, batch
  -- state and source-truth publication policy. The outer RPC is atomic.
  for v_item in select value from jsonb_array_elements(v_confirmation.pairs)
  loop
    perform public.decide_offerpsp_route_replacement(
      (v_item ->> 'draft_route_id')::uuid,
      'replace',
      (v_item ->> 'published_route_id')::uuid
    );
    v_publish_result := public.publish_offerpsp_route(
      (v_item ->> 'draft_route_id')::uuid
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'published_route_code', v_item ->> 'published_route_code',
      'published_route_status', 'archived',
      'draft_route_code', v_item ->> 'draft_route_code',
      'draft_route_status', 'published',
      'publish_result', v_publish_result
    ));
  end loop;

  update private.offerpsp_route_replacement_confirmations
  set status = 'executed',
      result = jsonb_build_object(
        'provider_id', v_confirmation.provider_id,
        'count', jsonb_array_length(v_confirmation.pairs),
        'items', v_results
      ),
      confirmed_at = now()
  where id = v_confirmation.id
  returning * into v_confirmation;

  insert into private.offerpsp_supply_activities(
    provider_id, actor_user_id, action_type, summary, after_state
  ) values (
    v_confirmation.provider_id,
    v_actor_user_id,
    'route_replacement_bulk_executed',
    'Token-bound atomic route replacements executed',
    jsonb_build_object(
      'confirmation_token', v_confirmation.id,
      'count', jsonb_array_length(v_confirmation.pairs),
      'items', v_results
    )
  );

  return jsonb_build_object(
    'handled', true,
    'confirmation_token', v_confirmation.id,
    'status', 'executed',
    'operation', 'replace_offer_routes',
    'processed', jsonb_array_length(v_confirmation.pairs),
    'result', v_confirmation.result
  );
end;
$$;

revoke all on function public.prepare_offerpsp_route_replacements(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.confirm_offerpsp_route_replacements(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.prepare_offerpsp_route_replacements(jsonb)
  to authenticated;
grant execute on function public.confirm_offerpsp_route_replacements(uuid)
  to authenticated;

comment on function public.prepare_offerpsp_route_replacements(jsonb) is
  'Creates an immutable, expiring route-replacement preview bound to the current OfferPSP staff session.';
comment on function public.confirm_offerpsp_route_replacements(uuid) is
  'Atomically executes one unexpired immutable route-replacement preview once, after full state revalidation.';
