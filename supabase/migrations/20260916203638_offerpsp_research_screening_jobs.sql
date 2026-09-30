-- Local Astra review candidate. Do not apply to production before review.
-- Durable preliminary evidence collection for newly-created research casinos/PSPs.
-- Existing rows are never backfilled: they run only through the explicit staff RPC.

create table private.offerpsp_research_screening_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('casino', 'psp')),
  entity_id bigint not null check (entity_id > 0),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  queued_reason text not null check (queued_reason in ('created', 'manual')),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{32}$'),
  run_id uuid,
  lease_until timestamptz,
  processing_started_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 3),
  result jsonb,
  result_hash text,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,48}$'),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  skipped_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (result is not null)),
  check (result is null or jsonb_typeof(result) = 'object')
);

alter table private.offerpsp_research_screening_jobs enable row level security;
revoke all on table private.offerpsp_research_screening_jobs from public, anon, authenticated, service_role;

create unique index offerpsp_research_screening_one_active_idx
  on private.offerpsp_research_screening_jobs(entity_type, entity_id)
  where status in ('pending', 'running');
create index offerpsp_research_screening_entity_history_idx
  on private.offerpsp_research_screening_jobs(entity_type, entity_id, queued_at desc);
create index offerpsp_research_screening_pending_idx
  on private.offerpsp_research_screening_jobs(queued_at, id)
  where status in ('pending', 'running');
create index offerpsp_research_screening_created_by_idx
  on private.offerpsp_research_screening_jobs(created_by) where created_by is not null;

create or replace function private.offerpsp_research_screening_input(p_entity_type text, p_entity_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_input jsonb;
begin
  if p_entity_type = 'casino' then
    select jsonb_build_object(
      'entity_type','casino','entity_id',c.id,'record_state',c.record_state,
      'screening_eligible',c.record_state='active' and lower(coalesce(c.contact_status,'')) not in ('rejected','lost','paused'),
      'company',c.name,'company_url',c.website,'work_email',c.email,
      'contact_name',c.contact_name,'telegram',c.telegram,'vertical',c.sphere,
      'geos',c.geo,'license_status',case when nullif(trim(c.license),'') is null then null else 'claimed' end,
      'qualification_notes',c.license,
      'details',concat_ws(E'\n',c.description,c.software,c.affiliate_program),
      'source',c.source,'existing_classification','merchant'
    ) into v_input from public.casino_leads c where c.id=p_entity_id;
  elsif p_entity_type = 'psp' then
    select jsonb_build_object(
      'entity_type','psp','entity_id',p.id,'record_state',p.record_state,
      'screening_eligible',p.record_state='active' and lower(coalesce(p.provider_status,'')) not in ('rejected','lost','paused','inactive'),
      'company',p.name,'company_url',p.website,'work_email',p.email,
      'contact_name',p.contact_name,'telegram',p.telegram,'vertical','payment services',
      'target_geos',p.supported_countries,'requested_methods',p.payment_methods,
      'requested_currencies',p.supported_currencies,
      'details',concat_ws(E'\n',p.specialization,p.risk_appetite,p.notes),
      'source',p.capabilities_source,'existing_classification','psp'
    ) into v_input from public.psp_providers p where p.id=p_entity_id;
  else
    raise exception 'Unsupported research entity type';
  end if;
  return v_input;
end;
$$;
revoke all on function private.offerpsp_research_screening_input(text,bigint) from public,anon,authenticated,service_role;

create or replace function private.offerpsp_research_screening_hash(p_entity_type text, p_entity_id bigint)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_material jsonb;
begin
  if p_entity_type = 'casino' then
    select jsonb_build_object('name',c.name,'website',c.website,'geo',c.geo,'license',c.license,
      'sphere',c.sphere,'description',c.description,'software',c.software,
      'affiliate_program',c.affiliate_program,'source',c.source,
      'eligible',c.record_state='active' and lower(coalesce(c.contact_status,'')) not in ('rejected','lost','paused'))
      into v_material from public.casino_leads c where c.id=p_entity_id;
  elsif p_entity_type = 'psp' then
    select jsonb_build_object('name',p.name,'website',p.website,'geo',p.geo,
      'specialization',p.specialization,'risk_appetite',p.risk_appetite,'notes',p.notes,
      'capabilities_source',p.capabilities_source,'countries',p.supported_countries,
      'methods',p.payment_methods,'currencies',p.supported_currencies,
      'verticals',p.supported_verticals,'eligible',p.record_state='active' and lower(coalesce(p.provider_status,'')) not in ('rejected','lost','paused','inactive'))
      into v_material from public.psp_providers p where p.id=p_entity_id;
  else
    raise exception 'Unsupported research entity type';
  end if;
  return case when v_material is null then null else md5(v_material::text) end;
end;
$$;
revoke all on function private.offerpsp_research_screening_hash(text,bigint) from public,anon,authenticated,service_role;

create or replace function private.offerpsp_queue_new_research_screening()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_type text := tg_argv[0];
begin
  if coalesce((private.offerpsp_research_screening_input(v_type,new.id)->>'screening_eligible')::boolean,false)
    and private.offerpsp_module_enabled('pre_compliance') then
    insert into private.offerpsp_research_screening_jobs(entity_type,entity_id,queued_reason,input_hash)
    values(v_type,new.id,'created',private.offerpsp_research_screening_hash(v_type,new.id))
    on conflict (entity_type,entity_id) where status in ('pending','running') do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.offerpsp_queue_new_research_screening() from public,anon,authenticated,service_role;

create trigger offerpsp_new_casino_research_screening
  after insert on public.casino_leads for each row
  execute function private.offerpsp_queue_new_research_screening('casino');
create trigger offerpsp_new_psp_research_screening
  after insert on public.psp_providers for each row
  execute function private.offerpsp_queue_new_research_screening('psp');

create or replace function public.queue_offerpsp_research_screening(p_entity_type text,p_entity_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_existing private.offerpsp_research_screening_jobs; v_job private.offerpsp_research_screening_jobs;
begin
  if not coalesce(public.is_offerpsp_staff(),false) then raise exception 'OfferPSP staff access required'; end if;
  if not private.offerpsp_module_enabled('pre_compliance') then raise exception 'Company screening module disabled'; end if;
  if p_entity_type not in ('casino','psp') or p_entity_id is null or p_entity_id<=0 then raise exception 'Research entity required'; end if;
  -- Serialize reruns for one entity even when no active job exists yet. Locking only the
  -- partial job-index result leaves a race between two first-time requests.
  if p_entity_type='casino' then
    perform 1 from public.casino_leads where id=p_entity_id for update;
  else
    perform 1 from public.psp_providers where id=p_entity_id for update;
  end if;
  if not found then raise exception 'Research entity not found'; end if;
  v_hash := private.offerpsp_research_screening_hash(p_entity_type,p_entity_id);
  if v_hash is null or not coalesce((private.offerpsp_research_screening_input(p_entity_type,p_entity_id)->>'screening_eligible')::boolean,false) then
    raise exception 'Active research entity required';
  end if;
  insert into private.offerpsp_research_screening_jobs(entity_type,entity_id,queued_reason,input_hash,created_by)
    values(p_entity_type,p_entity_id,'manual',v_hash,auth.uid())
    on conflict (entity_type,entity_id) where status in ('pending','running') do nothing
    returning * into v_job;
  if v_job.id is null then
    select * into v_existing from private.offerpsp_research_screening_jobs
      where entity_type=p_entity_type and entity_id=p_entity_id and status in ('pending','running');
    return jsonb_build_object('job_id',v_existing.id,'status',v_existing.status,'outcome','already_queued');
  end if;
  insert into private.offerpsp_entity_audit(entity_type,entity_id,action_type,actor_user_id,after_state)
    values(case when p_entity_type='casino' then 'research_casino' else 'research_psp' end,
      p_entity_id::text,'company_screening_requested',auth.uid(),jsonb_build_object('job_id',v_job.id));
  return jsonb_build_object('job_id',v_job.id,'status',v_job.status,'outcome','queued');
end;
$$;
revoke all on function public.queue_offerpsp_research_screening(text,bigint) from public,anon,service_role;
grant execute on function public.queue_offerpsp_research_screening(text,bigint) to authenticated;

create or replace function public.claim_offerpsp_research_screening_jobs(p_limit integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  if not private.offerpsp_module_enabled('pre_compliance') then return '[]'::jsonb; end if;
  update private.offerpsp_research_screening_jobs set status='failed',failed_at=now(),updated_at=now(),
    run_id=null,lease_until=null,processing_started_at=null,last_error_code='retry_limit_reached'
    where status='running' and attempts>=3 and (lease_until is null or lease_until<=now());
  with candidates as (
    select j.id from private.offerpsp_research_screening_jobs j
    where j.attempts<3 and (j.status='pending' or (j.status='running' and (j.lease_until is null or j.lease_until<=now())))
    order by j.queued_at,j.id limit least(greatest(coalesce(p_limit,1),1),10)
    for update skip locked
  ), claimed as (
    update private.offerpsp_research_screening_jobs j set status='running',run_id=gen_random_uuid(),
      lease_until=now()+interval '30 minutes',processing_started_at=null,attempts=j.attempts+1,
      started_at=coalesce(j.started_at,now()),last_error_code=null,updated_at=now()
    from candidates where j.id=candidates.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('job_id',id,'run_id',run_id)
    order by queued_at,id),'[]'::jsonb) into v_result from claimed;
  return v_result;
end;
$$;
revoke all on function public.claim_offerpsp_research_screening_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_offerpsp_research_screening_jobs(integer) to service_role;

create or replace function public.begin_offerpsp_research_screening_run(p_job_id uuid,p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job private.offerpsp_research_screening_jobs; v_input jsonb; v_hash text;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  select * into v_job from private.offerpsp_research_screening_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('outcome','stale_or_cancelled'); end if;
  if v_job.status='completed' and v_job.run_id=p_run_id then return jsonb_build_object('outcome','already_completed'); end if;
  if v_job.status<>'running' or v_job.run_id is distinct from p_run_id then
    return jsonb_build_object('outcome','stale_or_cancelled');
  end if;
  -- An expired owner must not mutate the job. Leaving it running allows the next claim to
  -- reclaim the lease with a new run_id and fences every late callback from the old owner.
  if v_job.lease_until is null or v_job.lease_until<=now() then
    return jsonb_build_object('outcome','stale_or_cancelled');
  end if;
  v_input := private.offerpsp_research_screening_input(v_job.entity_type,v_job.entity_id);
  v_hash := private.offerpsp_research_screening_hash(v_job.entity_type,v_job.entity_id);
  if v_input is null or not coalesce((v_input->>'screening_eligible')::boolean,false) or v_job.input_hash is distinct from v_hash then
    update private.offerpsp_research_screening_jobs set status='skipped',skipped_at=now(),updated_at=now(),
      last_error_code='stale_or_cancelled',lease_until=null,processing_started_at=null where id=p_job_id;
    return jsonb_build_object('outcome','stale_or_cancelled');
  end if;
  if not private.offerpsp_module_enabled('pre_compliance') then
    update private.offerpsp_research_screening_jobs set status='skipped',skipped_at=now(),updated_at=now(),
      last_error_code='module_disabled',lease_until=null,processing_started_at=null where id=p_job_id;
    return jsonb_build_object('outcome','module_disabled');
  end if;
  if v_job.processing_started_at is not null then return jsonb_build_object('outcome','in_progress'); end if;
  update private.offerpsp_research_screening_jobs set processing_started_at=now(),updated_at=now() where id=p_job_id;
  return jsonb_build_object('outcome','acquired','job',v_input||jsonb_build_object(
    'job_id',p_job_id,'run_id',p_run_id,'lease_until',v_job.lease_until));
end;
$$;
revoke all on function public.begin_offerpsp_research_screening_run(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_offerpsp_research_screening_run(uuid,uuid) to service_role;

create or replace function public.complete_offerpsp_research_screening_run(p_job_id uuid,p_run_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job private.offerpsp_research_screening_jobs; v_hash text;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>131072 then
    raise exception 'Invalid research screening completion';
  end if;
  select * into v_job from private.offerpsp_research_screening_jobs where id=p_job_id for update;
  if not found then return jsonb_build_object('outcome','stale_or_cancelled'); end if;
  if v_job.status='completed' and v_job.run_id=p_run_id then
    if v_job.result_hash is distinct from md5(p_payload::text) then raise exception 'Screening replay payload mismatch'; end if;
    return jsonb_build_object('job_id',p_job_id,'run_id',p_run_id,'outcome','already_completed');
  end if;
  if v_job.status<>'running' or v_job.run_id is distinct from p_run_id then
    return jsonb_build_object('job_id',p_job_id,'run_id',p_run_id,'outcome','stale_or_cancelled');
  end if;
  if v_job.lease_until is null or v_job.lease_until<=now() then
    return jsonb_build_object('job_id',p_job_id,'run_id',p_run_id,'outcome','stale_or_cancelled');
  end if;
  v_hash := private.offerpsp_research_screening_hash(v_job.entity_type,v_job.entity_id);
  if v_job.input_hash is distinct from v_hash then
    update private.offerpsp_research_screening_jobs set status='skipped',skipped_at=now(),updated_at=now(),
      last_error_code='stale_or_cancelled',lease_until=null,processing_started_at=null where id=p_job_id;
    return jsonb_build_object('job_id',p_job_id,'run_id',p_run_id,'outcome','stale_or_cancelled');
  end if;
  if not private.offerpsp_module_enabled('pre_compliance') then
    update private.offerpsp_research_screening_jobs set status='skipped',skipped_at=now(),updated_at=now(),
      last_error_code='module_disabled',lease_until=null,processing_started_at=null where id=p_job_id;
    return jsonb_build_object('outcome','module_disabled');
  end if;
  update private.offerpsp_research_screening_jobs set status='completed',result=p_payload,
    result_hash=md5(p_payload::text),completed_at=clock_timestamp(),lease_until=null,
    processing_started_at=null,last_error_code=null,updated_at=now() where id=p_job_id;
  insert into private.offerpsp_entity_audit(entity_type,entity_id,action_type,after_state)
    values(case when v_job.entity_type='casino' then 'research_casino' else 'research_psp' end,
      v_job.entity_id::text,'company_screening_completed',jsonb_build_object('job_id',p_job_id,'run_id',p_run_id));
  return jsonb_build_object('job_id',p_job_id,'run_id',p_run_id,'outcome','completed');
end;
$$;
revoke all on function public.complete_offerpsp_research_screening_run(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.complete_offerpsp_research_screening_run(uuid,uuid,jsonb) to service_role;

create or replace function public.fail_offerpsp_research_screening_run(p_job_id uuid,p_run_id uuid,p_error_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_job private.offerpsp_research_screening_jobs; v_code text; v_input jsonb; v_hash text;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  v_code := case when p_error_code ~ '^[a-z0-9_]{1,48}$' then p_error_code else 'collector_failed' end;
  select * into v_job from private.offerpsp_research_screening_jobs where id=p_job_id for update;
  if not found or v_job.status<>'running' or v_job.run_id is distinct from p_run_id then
    return jsonb_build_object('outcome','stale_or_cancelled');
  end if;
  if v_job.lease_until is null or v_job.lease_until<=now() then
    return jsonb_build_object('outcome','stale_or_cancelled');
  end if;
  v_input := private.offerpsp_research_screening_input(v_job.entity_type,v_job.entity_id);
  v_hash := private.offerpsp_research_screening_hash(v_job.entity_type,v_job.entity_id);
  if v_input is null or not coalesce((v_input->>'screening_eligible')::boolean,false) or v_job.input_hash is distinct from v_hash then
    update private.offerpsp_research_screening_jobs set status='skipped',skipped_at=now(),updated_at=now(),
      last_error_code='stale_or_cancelled',lease_until=null,processing_started_at=null where id=p_job_id;
    return jsonb_build_object('job_id',p_job_id,'outcome','stale_or_cancelled');
  end if;
  if not private.offerpsp_module_enabled('pre_compliance') then
    update private.offerpsp_research_screening_jobs set status='skipped',skipped_at=now(),updated_at=now(),
      last_error_code='module_disabled',lease_until=null,processing_started_at=null where id=p_job_id;
    return jsonb_build_object('job_id',p_job_id,'outcome','module_disabled');
  end if;
  if v_job.attempts<3 then
    update private.offerpsp_research_screening_jobs set status='pending',run_id=null,lease_until=null,
      processing_started_at=null,last_error_code=v_code,updated_at=now() where id=p_job_id;
    return jsonb_build_object('job_id',p_job_id,'outcome','retry_queued');
  end if;
  update private.offerpsp_research_screening_jobs set status='failed',failed_at=now(),lease_until=null,
    processing_started_at=null,last_error_code=v_code,updated_at=now() where id=p_job_id;
  return jsonb_build_object('job_id',p_job_id,'outcome','failed');
end;
$$;
revoke all on function public.fail_offerpsp_research_screening_run(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_offerpsp_research_screening_run(uuid,uuid,text) to service_role;

create or replace function public.get_offerpsp_research_screening(p_entity_type text,p_entity_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_hash text; v_state text;
begin
  if not coalesce(public.is_offerpsp_staff(),false) then raise exception 'OfferPSP staff access required'; end if;
  if p_entity_type not in ('casino','psp') then raise exception 'Unsupported research entity type'; end if;
  v_hash := private.offerpsp_research_screening_hash(p_entity_type,p_entity_id);
  v_state := private.offerpsp_research_screening_input(p_entity_type,p_entity_id)->>'record_state';
  if v_hash is null then raise exception 'Research entity not found'; end if;
  return jsonb_build_object(
    'entity_type',p_entity_type,'entity_id',p_entity_id,'record_state',v_state,
    'active_job',(select to_jsonb(j)-'result'-'result_hash'-'input_hash'-'run_id'-'lease_until'-'processing_started_at' from private.offerpsp_research_screening_jobs j
      where j.entity_type=p_entity_type and j.entity_id=p_entity_id and j.status in ('pending','running') order by j.queued_at desc limit 1),
    'latest_job',(select to_jsonb(j)-'result_hash'-'input_hash'-'run_id'-'lease_until'-'processing_started_at' from private.offerpsp_research_screening_jobs j
      where j.entity_type=p_entity_type and j.entity_id=p_entity_id order by j.queued_at desc limit 1),
    'latest_completed',(select to_jsonb(j)-'result_hash'-'input_hash'-'run_id'-'lease_until'-'processing_started_at' from private.offerpsp_research_screening_jobs j
      where j.entity_type=p_entity_type and j.entity_id=p_entity_id and j.status='completed' order by j.completed_at desc limit 1),
    'result_current',coalesce((select j.input_hash=v_hash from private.offerpsp_research_screening_jobs j
      where j.entity_type=p_entity_type and j.entity_id=p_entity_id and j.status='completed' order by j.completed_at desc limit 1),false)
  );
end;
$$;
revoke all on function public.get_offerpsp_research_screening(text,bigint) from public,anon,service_role;
grant execute on function public.get_offerpsp_research_screening(text,bigint) to authenticated;
