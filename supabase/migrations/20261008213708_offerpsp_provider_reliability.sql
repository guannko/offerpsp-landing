-- Staff-only, evidence-based provider assessments. Never changes contact state,
-- offers, matching or merchant-visible projections; no implicit backfill.
create table private.offerpsp_provider_reliability (
  entity_type text not null check (entity_type in ('provider','research_psp')),
  entity_id text not null,
  category text not null check (category in ('working','review_later')),
  decision text not null check (decision in ('pending','conditional','restricted','approved')),
  score integer not null check (score between 0 and 100),
  points jsonb not null,
  confidence text not null check (confidence in ('low','medium','high')),
  scope text not null check (length(trim(scope)) between 1 and 1000),
  reason text not null check (length(trim(reason)) between 1 and 8000),
  next_step text not null check (length(trim(next_step)) between 1 and 4000),
  sources jsonb not null default '[]',
  methodology text not null default 'evidence_trust_v1',
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (entity_type,entity_id)
);
alter table private.offerpsp_provider_reliability enable row level security;
revoke all on private.offerpsp_provider_reliability from public,anon,authenticated,service_role;

create function public.get_offerpsp_provider_reliability()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(public.is_offerpsp_staff(),false) then
    raise exception 'OfferPSP staff access required' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc)
    from private.offerpsp_provider_reliability r),'[]'::jsonb);
end; $$;

create function private.offerpsp_validate_provider_reliability(p_payload jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  v_points jsonb; v_limits jsonb := '{"legal":25,"funds":25,"operations":20,"reputation":15,"transparency":15}';
  v_key text; v_value jsonb; v_score integer := 0; v_count integer := 0; v_known integer := 0;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Assessment payload required'; end if;
  v_points := p_payload->'points';
  if v_points is null or jsonb_typeof(v_points)<>'object' then raise exception 'Five assessment criteria required'; end if;
  for v_key,v_value in select key,value from jsonb_each(v_points) loop
    if not (v_limits ? v_key) then raise exception 'Unknown assessment criterion'; end if;
    v_count := v_count+1;
    if v_value<>'null'::jsonb then
      if jsonb_typeof(v_value)<>'number' then raise exception 'Criterion must be an integer or null'; end if;
      if (v_value::text)::numeric<>trunc((v_value::text)::numeric)
        or (v_value::text)::numeric<0 or (v_value::text)::numeric>(v_limits->>v_key)::integer then
        raise exception 'Criterion outside its range';
      end if;
      v_score := v_score+(v_value::text)::integer;
      v_known := v_known+1;
    end if;
  end loop;
  if v_count<>5 then raise exception 'Five assessment criteria required'; end if;
  if v_known=0 then raise exception 'At least one criterion must be assessed'; end if;
  if p_payload->>'category' is null or p_payload->>'category' not in ('working','review_later')
    or p_payload->>'decision' is null or p_payload->>'decision' not in ('pending','conditional','restricted','approved')
    or p_payload->>'confidence' is null or p_payload->>'confidence' not in ('low','medium','high') then
    raise exception 'Invalid assessment classification';
  end if;
  if nullif(trim(p_payload->>'scope'),'') is null or nullif(trim(p_payload->>'reason'),'') is null
    or nullif(trim(p_payload->>'next_step'),'') is null then raise exception 'Scope, reason and next step required'; end if;
  if length(trim(p_payload->>'scope'))>1000 or length(trim(p_payload->>'reason'))>8000
    or length(trim(p_payload->>'next_step'))>4000 then raise exception 'Assessment text too long'; end if;
  if p_payload->'sources' is null or jsonb_typeof(p_payload->'sources')<>'array' then raise exception 'Public HTTPS sources required'; end if;
  if jsonb_array_length(p_payload->'sources')>30 then raise exception 'Too many sources'; end if;
  for v_value in select value from jsonb_array_elements(p_payload->'sources') loop
    if jsonb_typeof(v_value)<>'string' or length(v_value#>>'{}')>2048
      or (v_value#>>'{}') !~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then raise exception 'Public HTTPS sources required'; end if;
  end loop;
  if jsonb_array_length(p_payload->'sources')=0 then raise exception 'At least one source required'; end if;
  return v_score;
end; $$;
revoke all on function private.offerpsp_validate_provider_reliability(jsonb) from public,anon,authenticated,service_role;


create function public.save_offerpsp_provider_reliability(
  p_entity_type text,p_entity_id text,p_payload jsonb,p_expected_updated_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_before private.offerpsp_provider_reliability;
  v_after private.offerpsp_provider_reliability;
  v_score integer;
begin
  if auth.uid() is null or not coalesce(public.is_offerpsp_staff(),false) then
    raise exception 'OfferPSP staff access required' using errcode='42501';
  end if;
  if p_entity_type is null or p_entity_type not in ('provider','research_psp') or p_entity_id is null then
    raise exception 'Unsupported provider identity';
  end if;
  if p_entity_type='provider' then
    if not exists(select 1 from private.offerpsp_providers where id::text=p_entity_id) then
      raise exception 'Provider not found';
    end if;
  elsif not exists(select 1 from public.psp_providers where id::text=p_entity_id) then
    raise exception 'Research PSP not found';
  end if;
  v_score := private.offerpsp_validate_provider_reliability(p_payload);
  -- Serialize create/update and reject stale edits, including concurrent initial inserts.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_entity_type||':'||p_entity_id,0));
  select * into v_before from private.offerpsp_provider_reliability
    where entity_type=p_entity_type and entity_id=p_entity_id for update;
  if found and v_before.updated_at is distinct from p_expected_updated_at then
    raise exception 'Assessment changed. Reload before saving.' using errcode='40001';
  elsif not found and p_expected_updated_at is not null then
    raise exception 'Assessment changed. Reload before saving.' using errcode='40001';
  end if;
  insert into private.offerpsp_provider_reliability(entity_type,entity_id,category,decision,score,points,
    confidence,scope,reason,next_step,sources,updated_by)
  values(p_entity_type,p_entity_id,p_payload->>'category',p_payload->>'decision',v_score,p_payload->'points',
    p_payload->>'confidence',trim(p_payload->>'scope'),trim(p_payload->>'reason'),trim(p_payload->>'next_step'),
    p_payload->'sources',auth.uid())
  on conflict(entity_type,entity_id) do update set category=excluded.category,decision=excluded.decision,
    score=excluded.score,points=excluded.points,confidence=excluded.confidence,scope=excluded.scope,
    reason=excluded.reason,next_step=excluded.next_step,sources=excluded.sources,
    updated_at=clock_timestamp(),updated_by=auth.uid()
  returning * into v_after;
  insert into private.offerpsp_entity_audit(entity_type,entity_id,action_type,actor_user_id,before_state,after_state)
    values(p_entity_type,p_entity_id,'reliability_assessment_saved',auth.uid(),
      case when v_before.entity_id is null then null else to_jsonb(v_before) end,to_jsonb(v_after));
  return to_jsonb(v_after);
end; $$;
revoke all on function public.get_offerpsp_provider_reliability() from public,anon,service_role;
revoke all on function public.save_offerpsp_provider_reliability(text,text,jsonb,timestamptz) from public,anon,service_role;
grant execute on function public.get_offerpsp_provider_reliability() to authenticated;
grant execute on function public.save_offerpsp_provider_reliability(text,text,jsonb,timestamptz) to authenticated;

-- Immutable, session-bound batch snapshots; preparation never changes a PSP.
create table private.offerpsp_reliability_confirmations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  actor_session_id text not null,
  preview jsonb not null,
  status text not null default 'pending' check(status in ('pending','executed','expired')),
  expires_at timestamptz not null default clock_timestamp()+interval '10 minutes',
  result jsonb,
  confirmed_at timestamptz
);
alter table private.offerpsp_reliability_confirmations enable row level security;
revoke all on private.offerpsp_reliability_confirmations from public,anon,authenticated,service_role;

create function private.offerpsp_reliability_domain(p_website text)
returns text language sql immutable set search_path='' as $$
  select split_part(regexp_replace(lower(trim(coalesce(p_website,''))), '^https?://(www\.)?', ''), '/', 1);
$$;
revoke all on function private.offerpsp_reliability_domain(text) from public,anon,authenticated,service_role;

create function public.prepare_offerpsp_provider_reliability_batch(p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_item jsonb; v_entity jsonb; v_before jsonb; v_preview jsonb := '[]';
  v_name text; v_domain text; v_type text; v_id text; v_score integer; v_token uuid; v_expiry timestamptz;
  v_seen text[] := '{}'; v_key text;
begin
  if auth.uid() is null or not coalesce(public.is_offerpsp_staff(),false) then
    raise exception 'OfferPSP staff access required' using errcode='42501';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Assessment items required'; end if;
  if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Batch requires 1 to 50 PSPs'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := nullif(trim(v_item->>'name'),'');
    v_type := v_item->>'entity_type'; v_id := nullif(v_item->>'entity_id','');
    v_domain := private.offerpsp_reliability_domain(v_item->>'website');
    if v_name is null or length(v_name)>200 or v_domain !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'
      or v_type is null or v_type not in ('provider','research_psp') then raise exception 'Exact PSP identity required'; end if;
    v_key := v_type||':'||coalesce(v_id,'new:'||v_domain);
    if v_key=any(v_seen) or ('domain:'||v_domain)=any(v_seen) then raise exception 'Duplicate batch identity'; end if;
    v_seen := array_append(array_append(v_seen,v_key),'domain:'||v_domain);
    v_entity := null;
    if v_id is not null then
      if v_type='provider' then
        select to_jsonb(p) into v_entity from private.offerpsp_providers p where id::text=v_id;
      else
        select to_jsonb(p) into v_entity from public.psp_providers p where id::text=v_id;
      end if;
      if v_entity is null or lower(trim(coalesce(v_entity->>'name',v_entity->>'brand_name')))<>lower(v_name)
        or private.offerpsp_reliability_domain(v_entity->>'website')<>v_domain then raise exception 'PSP identity mismatch or not found'; end if;
    else
      if v_type<>'research_psp' then raise exception 'Only research PSP creation is supported'; end if;
      if exists(select 1 from public.psp_providers p where lower(trim(p.name))=lower(v_name)
        or private.offerpsp_reliability_domain(p.website)=v_domain)
        or exists(select 1 from private.offerpsp_providers p where lower(trim(p.brand_name))=lower(v_name)
        or private.offerpsp_reliability_domain(p.website)=v_domain) then raise exception 'PSP already exists or identity is ambiguous'; end if;
    end if;
    v_score := private.offerpsp_validate_provider_reliability(v_item->'payload');
    select to_jsonb(r) into v_before from private.offerpsp_provider_reliability r
      where entity_type=v_type and entity_id=v_id;
    v_preview := v_preview||jsonb_build_array(jsonb_build_object('name',v_name,'website','https://'||v_domain,
      'entity_type',v_type,'entity_id',v_id,'create_research',v_id is null,'entity_snapshot',v_entity,
      'before',v_before,'payload',v_item->'payload','score',v_score));
  end loop;
  insert into private.offerpsp_reliability_confirmations(actor_user_id,actor_session_id,preview)
    values(auth.uid(),private.offerpsp_confirmation_session_id(),v_preview) returning id,expires_at into v_token,v_expiry;
  return jsonb_build_object('handled',true,'status','pending','confirmation_required',true,
    'confirmation_token',v_token,'expires_at',v_expiry,'preview',v_preview);
end; $$;

create function public.confirm_offerpsp_provider_reliability_batch(p_confirmation_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_confirmation private.offerpsp_reliability_confirmations;
  v_item jsonb; v_entity jsonb; v_id text; v_name text; v_domain text; v_result jsonb := '[]';
begin
  if auth.uid() is null or not coalesce(public.is_offerpsp_staff(),false) then
    raise exception 'OfferPSP staff access required' using errcode='42501';
  end if;
  select * into v_confirmation from private.offerpsp_reliability_confirmations where id=p_confirmation_token for update;
  if not found then return jsonb_build_object('handled',false); end if;
  if v_confirmation.actor_user_id<>auth.uid() or v_confirmation.actor_session_id<>private.offerpsp_confirmation_session_id() then
    raise exception 'Confirmation belongs to another staff session' using errcode='42501';
  end if;
  if v_confirmation.status='executed' then return v_confirmation.result||jsonb_build_object('status','already_executed'); end if;
  if v_confirmation.status<>'pending' or v_confirmation.expires_at<=clock_timestamp() then
    update private.offerpsp_reliability_confirmations set status='expired' where id=p_confirmation_token;
    return jsonb_build_object('handled',true,'status','expired');
  end if;
  -- Fence concurrent CRUD and new-card creation while validating the exact identity snapshot.
  lock table public.psp_providers in share row exclusive mode;
  lock table private.offerpsp_providers in share row exclusive mode;
  for v_item in select value from jsonb_array_elements(v_confirmation.preview) loop
    v_id := v_item->>'entity_id'; v_name := v_item->>'name';
    v_domain := private.offerpsp_reliability_domain(v_item->>'website');
    v_entity := null;
    if (v_item->>'create_research')::boolean then
      if exists(select 1 from public.psp_providers p where lower(trim(p.name))=lower(v_name) or private.offerpsp_reliability_domain(p.website)=v_domain)
        or exists(select 1 from private.offerpsp_providers p where lower(trim(p.brand_name))=lower(v_name) or private.offerpsp_reliability_domain(p.website)=v_domain) then
        raise exception 'PSP appeared after preview. Prepare again.' using errcode='40001';
      end if;
      v_entity := public.save_offerpsp_research_entity('psp',null,jsonb_build_object('name',v_name,'website',v_item->>'website',
        'provider_status','research','contact_status','not_contacted','capabilities_source','reliability_audit'));
      v_id := v_entity->>'id';
    else
      if v_item->>'entity_type'='provider' then
        select to_jsonb(p) into v_entity from private.offerpsp_providers p where id::text=v_id for update;
      else
        select to_jsonb(p) into v_entity from public.psp_providers p where id::text=v_id for update;
      end if;
      if v_entity is distinct from v_item->'entity_snapshot' then raise exception 'PSP changed after preview. Prepare again.' using errcode='40001'; end if;
    end if;
    v_result := v_result||jsonb_build_array(public.save_offerpsp_provider_reliability(v_item->>'entity_type',v_id,v_item->'payload',
      nullif(v_item->'before'->>'updated_at','')::timestamptz));
  end loop;
  v_result := jsonb_build_object('handled',true,'status','executed','confirmation_token',p_confirmation_token,'assessments',v_result);
  update private.offerpsp_reliability_confirmations set status='executed',result=v_result,confirmed_at=clock_timestamp()
    where id=p_confirmation_token;
  return v_result;
end; $$;
revoke all on function public.prepare_offerpsp_provider_reliability_batch(jsonb) from public,anon,service_role;
revoke all on function public.confirm_offerpsp_provider_reliability_batch(uuid) from public,anon,service_role;
grant execute on function public.prepare_offerpsp_provider_reliability_batch(jsonb) to authenticated;
grant execute on function public.confirm_offerpsp_provider_reliability_batch(uuid) to authenticated;
notify pgrst, 'reload schema';
