-- OfferPSP source-truth publication policy.
-- PSP rate cards are commercial source material, not data authored by us.
-- Parser anomalies and missing extracted fields remain visible as review notes,
-- but they never block an explicit staff publication or resume decision.

create or replace function public.publish_offerpsp_rate_card(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_batch private.offerpsp_rate_card_batches;
  v_provider private.offerpsp_providers;
  v_route_count integer;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_batch
  from private.offerpsp_rate_card_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Rate-card batch not found';
  end if;
  if v_batch.status not in ('draft', 'review') then
    raise exception 'Only draft or review batches can be published';
  end if;

  select * into v_provider
  from private.offerpsp_providers
  where id = v_batch.provider_id;

  select count(*) into v_route_count
  from private.offerpsp_offer_routes
  where batch_id = v_batch.id
    and status in ('draft', 'review');

  if v_route_count = 0 then
    raise exception 'A rate-card must contain at least one route selected for publication';
  end if;

  update private.offerpsp_offer_routes
  set status = 'published', updated_at = now()
  where batch_id = v_batch.id
    and status in ('draft', 'review');

  update private.offerpsp_offer_routes old_route
  set status = 'archived', updated_at = now()
  where old_route.provider_id = v_batch.provider_id
    and old_route.status in ('published', 'paused')
    and old_route.batch_id <> v_batch.id
    and exists (
      select 1
      from private.offerpsp_offer_routes successor
      where successor.batch_id = v_batch.id
        and successor.status = 'published'
        and successor.revision_of_route_id = old_route.id
    );

  update private.offerpsp_rate_card_batches
  set status = 'superseded',
      superseded_at = now(),
      updated_at = now()
  where provider_id = v_batch.provider_id
    and status = 'published'
    and id <> v_batch.id;

  update private.offerpsp_rate_card_batches
  set status = 'published',
      published_by = auth.uid(),
      published_at = now(),
      updated_at = now()
  where id = v_batch.id;

  update private.offerpsp_providers
  set relationship_status = case
        when relationship_status in ('prospect', 'onboarding') then 'active'
        else relationship_status
      end,
      last_verified_at = now(),
      updated_at = now()
  where id = v_batch.provider_id;

  insert into private.offerpsp_supply_activities(
    provider_id, batch_id, actor_user_id, action_type, summary, after_state
  ) values (
    v_batch.provider_id, v_batch.id, auth.uid(),
    'rate_card_published', 'PSP source rate card explicitly published by staff',
    jsonb_build_object('status', 'published', 'route_count', v_route_count)
  );

  return jsonb_build_object(
    'batch_id', v_batch.id,
    'provider_code', v_provider.internal_code,
    'status', 'published',
    'route_count', v_route_count
  );
end;
$$;

create or replace function public.publish_offerpsp_route(p_route_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_route private.offerpsp_offer_routes;
  v_remaining_routes integer;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_route
  from private.offerpsp_offer_routes
  where id = p_route_id
  for update;

  if not found then
    raise exception 'OfferPSP route not found';
  end if;
  if v_route.status not in ('draft', 'review') then
    raise exception 'Only a draft or review route can be published';
  end if;

  update private.offerpsp_offer_routes
  set status = 'published', updated_at = now()
  where id = v_route.id;

  if v_route.revision_of_route_id is not null then
    update private.offerpsp_offer_routes
    set status = 'archived', updated_at = now()
    where id = v_route.revision_of_route_id
      and status in ('published', 'paused');
  end if;

  select count(*) into v_remaining_routes
  from private.offerpsp_offer_routes
  where batch_id = v_route.batch_id
    and status in ('draft', 'review');

  update private.offerpsp_rate_card_batches
  set status = case when v_remaining_routes = 0 then 'published' else 'review' end,
      published_by = case when v_remaining_routes = 0 then auth.uid() else published_by end,
      published_at = case when v_remaining_routes = 0 then now() else published_at end,
      updated_at = now()
  where id = v_route.batch_id;

  update private.offerpsp_providers
  set relationship_status = case
        when relationship_status in ('prospect', 'onboarding') then 'active'
        else relationship_status
      end,
      last_verified_at = now(),
      updated_at = now()
  where id = v_route.provider_id;

  insert into private.offerpsp_supply_activities(
    provider_id, route_id, batch_id, actor_user_id, action_type, summary, after_state
  ) values (
    v_route.provider_id, v_route.id, v_route.batch_id, auth.uid(),
    'route_published', 'PSP source offer explicitly published by staff',
    jsonb_build_object('status', 'published', 'revision_of_route_id', v_route.revision_of_route_id)
  );

  insert into private.offerpsp_entity_audit(
    entity_type, entity_id, action_type, actor_user_id, after_state
  ) values (
    'offer', v_route.id::text, 'published', auth.uid(),
    jsonb_build_object('status', 'published', 'batch_id', v_route.batch_id)
  );

  return jsonb_build_object(
    'route_id', v_route.id,
    'batch_id', v_route.batch_id,
    'provider_id', v_route.provider_id,
    'status', 'published'
  );
end;
$$;

create or replace function public.set_offerpsp_route_status(p_route_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_before private.offerpsp_offer_routes;
  v_after private.offerpsp_offer_routes;
  v_batch_status text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select * into v_before
  from private.offerpsp_offer_routes
  where id = p_route_id
  for update;

  if not found then
    raise exception 'OfferPSP route not found';
  end if;

  select status into v_batch_status
  from private.offerpsp_rate_card_batches
  where id = v_before.batch_id;

  if p_status = 'paused' and v_before.status <> 'published' then
    raise exception 'Only a published route can be paused';
  end if;
  if p_status = 'published' and not (v_before.status = 'paused' and v_batch_status = 'published') then
    raise exception 'Only a paused route from the published batch can be resumed';
  end if;
  if p_status = 'review' and v_before.status not in ('draft', 'archived') then
    raise exception 'Only a draft or archived route can return to review';
  end if;
  if p_status = 'archived' and v_before.status not in ('draft', 'review', 'paused') then
    raise exception 'This route cannot be archived directly';
  end if;
  if p_status not in ('review', 'published', 'paused', 'archived') then
    raise exception 'Unsupported route status';
  end if;

  update private.offerpsp_offer_routes
  set status = p_status, updated_at = now()
  where id = p_route_id
  returning * into v_after;

  insert into private.offerpsp_supply_activities(
    provider_id, route_id, batch_id, actor_user_id, action_type, summary, before_state, after_state
  ) values (
    v_after.provider_id, v_after.id, v_after.batch_id, auth.uid(),
    'route_status_changed', 'Route status changed to ' || p_status,
    to_jsonb(v_before), to_jsonb(v_after)
  );

  return to_jsonb(v_after) - 'raw_block';
end;
$$;

comment on function public.publish_offerpsp_rate_card(uuid) is
  'Publishes staff-approved PSP source terms. Parser review notes never block publication.';
comment on function public.publish_offerpsp_route(uuid) is
  'Publishes one staff-approved PSP source route. Missing or unusual source fields remain review notes.';
comment on function public.set_offerpsp_route_status(uuid, text) is
  'Changes explicit route lifecycle state; resuming is a staff decision and is not blocked by parser notes.';
