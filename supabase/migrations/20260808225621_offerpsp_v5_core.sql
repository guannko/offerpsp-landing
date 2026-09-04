-- OfferPSP v5: version-driven lifecycle.
-- Dates and follow-up cadence are informational and never deactivate an offer.

alter table private.offerpsp_ingestion_jobs
  drop constraint if exists offerpsp_ingestion_jobs_provider_name_source_hash_key;
alter table private.offerpsp_rate_card_batches
  drop constraint if exists offerpsp_rate_card_batches_provider_source_parser_key;
create index if not exists offerpsp_ingestion_jobs_source_hash_idx
  on private.offerpsp_ingestion_jobs(provider_name, source_hash, received_at desc);
create index if not exists offerpsp_rate_card_batches_source_hash_idx
  on private.offerpsp_rate_card_batches(provider_id, source_hash, received_at desc);

create or replace function private.offerpsp_route_commercial_fingerprint(p_route_id uuid)
returns text
language sql
stable
set search_path = public, private, pg_catalog
as $$
  select md5(jsonb_build_object(
    'route', to_jsonb(r)
      - 'id' - 'provider_id' - 'batch_id' - 'internal_code'
      - 'status' - 'revision_of_route_id' - 'effective_from' - 'expires_at'
      - 'freshness_days' - 'raw_block' - 'created_at' - 'updated_at',
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

create or replace function private.offerpsp_compute_route_staleness(p_route_id uuid)
returns text
language sql
stable
set search_path = public, private, pg_catalog
as $$
  select case
    when r.status = 'published' then null
    when r.status = 'paused' then 'paused'
    when r.status in ('archived', 'superseded') and exists (
      select 1 from private.offerpsp_offer_routes revision
      where revision.revision_of_route_id = r.id
        and revision.status = 'published'
    ) then 'updated'
    else 'unavailable'
  end
  from private.offerpsp_offer_routes r
  where r.id = p_route_id;
$$;

create or replace function private.tg_offerpsp_route_staleness()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_catalog
as $$
declare
  v_staleness text;
  v_successor_id uuid;
  v_item record;
begin
  if new.status = old.status then return new; end if;

  if new.status in ('archived', 'superseded') then
    select revision.id into v_successor_id
    from private.offerpsp_offer_routes revision
    where revision.revision_of_route_id = new.id
      and revision.status = 'published'
    order by revision.created_at desc
    limit 1;

    if v_successor_id is not null
       and private.offerpsp_route_commercial_fingerprint(new.id)
           = private.offerpsp_route_commercial_fingerprint(v_successor_id) then
      update public.offerpsp_shortlist_items
      set offer_route_id = v_successor_id,
          route_staleness_status = null
      where offer_route_id = new.id;

      update private.offerpsp_offer_update_queue
      set status = 'dismissed',
          new_route_id = v_successor_id,
          notes = trim(both from concat_ws(chr(10), notes,
            'Automatically resolved: partner reconfirmed identical commercial terms.')),
          updated_at = now()
      where old_route_id = new.id
        and status in ('pending', 'in_progress');
      return new;
    end if;
  end if;

  v_staleness := private.offerpsp_compute_route_staleness(new.id);
  if v_staleness is null then
    update public.offerpsp_shortlist_items
    set route_staleness_status = null
    where offer_route_id = new.id and route_staleness_status is not null;
    return new;
  end if;

  for v_item in
    select si.id, si.shortlist_id, sl.lead_id, si.client_response
    from public.offerpsp_shortlist_items si
    join public.offerpsp_shortlists sl on sl.id = si.shortlist_id
    where si.offer_route_id = new.id and sl.status = 'shared'
  loop
    update public.offerpsp_shortlist_items
    set route_staleness_status = v_staleness
    where id = v_item.id;

    insert into private.offerpsp_offer_update_queue(
      lead_id, shortlist_id, shortlist_item_id, old_route_id,
      trigger_event, has_client_selection, due_at
    )
    select v_item.lead_id, v_item.shortlist_id, v_item.id, new.id,
      v_staleness, coalesce(v_item.client_response = 'interested', false),
      case when coalesce(v_item.client_response = 'interested', false)
        then now() + interval '1 day' else now() + interval '3 days' end
    where not exists (
      select 1 from private.offerpsp_offer_update_queue q
      where q.shortlist_item_id = v_item.id
        and q.old_route_id = new.id
        and q.status in ('pending', 'in_progress')
    );
  end loop;
  return new;
end;
$$;

revoke all on function private.tg_offerpsp_route_staleness()
  from public, anon, authenticated;

drop trigger if exists tg_offerpsp_route_staleness on private.offerpsp_offer_routes;
create trigger tg_offerpsp_route_staleness
after update of status on private.offerpsp_offer_routes
for each row execute function private.tg_offerpsp_route_staleness();

create or replace function public.offerpsp_process_expired_routes()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not public.is_offerpsp_staff() then
    raise exception 'Service or staff access required';
  end if;
  return jsonb_build_object(
    'disabled', true,
    'reason', 'version_driven_lifecycle',
    'items_updated', 0,
    'tasks_created', 0,
    'processed_at', now()
  );
end;
$$;

revoke all on function public.offerpsp_process_expired_routes()
  from public, anon, authenticated;
grant execute on function public.offerpsp_process_expired_routes() to service_role;

-- Retire false alarms created solely by the former date-based lifecycle.
update private.offerpsp_offer_update_queue
set status = 'dismissed',
    notes = trim(both from concat_ws(chr(10), notes,
      'Automatically closed: date-based offer expiry was retired.')),
    updated_at = now()
where trigger_event = 'expired'
  and status in ('pending', 'in_progress');

update public.offerpsp_shortlist_items si
set route_staleness_status = private.offerpsp_compute_route_staleness(si.offer_route_id)
where si.offer_route_id is not null
  and si.route_staleness_status is distinct from
      private.offerpsp_compute_route_staleness(si.offer_route_id);
