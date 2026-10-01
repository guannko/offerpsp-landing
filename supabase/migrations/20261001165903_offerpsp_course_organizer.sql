-- Captain-owned planning, separate from tasks, pricing and automation lifecycles.
create table private.offerpsp_course_plan (
  singleton boolean primary key default true check (singleton),
  revision integer not null default 0 check (revision >= 0),
  plan jsonb not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table private.offerpsp_course_plan_history (
  revision integer primary key,
  plan jsonb not null,
  actor_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table private.offerpsp_course_plan enable row level security;
alter table private.offerpsp_course_plan_history enable row level security;
revoke all on private.offerpsp_course_plan, private.offerpsp_course_plan_history from public, anon, authenticated, service_role;

create function public.get_offerpsp_course_plan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row private.offerpsp_course_plan;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required' using errcode = '42501';
  end if;
  select * into v_row from private.offerpsp_course_plan where singleton;
  if not found then
    return jsonb_build_object('revision', 0, 'plan', null, 'updated_at', null);
  end if;
  return jsonb_build_object('revision', v_row.revision, 'plan', v_row.plan, 'updated_at', v_row.updated_at);
end;
$$;

create function public.save_offerpsp_course_plan(p_expected_revision integer, p_plan jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row private.offerpsp_course_plan;
  v_direction jsonb;
  v_key text;
begin
  if auth.uid() is null or not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'Invalid revision'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' or octet_length(p_plan::text) > 65536 then raise exception 'Invalid course plan'; end if;
  if exists (select 1 from jsonb_object_keys(p_plan) k where k not in ('course', 'directions'))
    or jsonb_typeof(p_plan -> 'course') is distinct from 'string'
    or length(trim(p_plan ->> 'course')) not between 1 and 2000
    or jsonb_typeof(p_plan -> 'directions') is distinct from 'array' then raise exception 'Invalid course plan'; end if;
  if jsonb_array_length(p_plan -> 'directions') > 12 then raise exception 'Too many directions'; end if;
  for v_direction in select value from jsonb_array_elements(p_plan -> 'directions') loop
    if jsonb_typeof(v_direction) <> 'object' then raise exception 'Invalid direction'; end if;
    if exists (select 1 from jsonb_object_keys(v_direction) k where k not in ('id','title','outcome','paused','lead_ids','task_ids'))
      or jsonb_typeof(v_direction -> 'id') is distinct from 'string'
      or (v_direction ->> 'id') !~ '^[a-zA-Z0-9_-]{1,80}$'
      or jsonb_typeof(v_direction -> 'title') is distinct from 'string'
      or length(trim(v_direction ->> 'title')) not between 1 and 120
      or jsonb_typeof(v_direction -> 'outcome') is distinct from 'string'
      or length(trim(v_direction ->> 'outcome')) not between 1 and 2000
      or jsonb_typeof(v_direction -> 'paused') is distinct from 'boolean' then raise exception 'Invalid direction'; end if;
    foreach v_key in array array['lead_ids','task_ids'] loop
      if jsonb_typeof(v_direction -> v_key) is distinct from 'array' then raise exception 'Invalid direction links'; end if;
      if jsonb_array_length(v_direction -> v_key) > 60
        or exists (select 1 from jsonb_array_elements(v_direction -> v_key) e where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[0-9a-fA-F-]{36}$')
        then raise exception 'Invalid direction links'; end if;
      if (select count(*) <> count(distinct value) from jsonb_array_elements_text(v_direction -> v_key)) then raise exception 'Duplicate direction links'; end if;
    end loop;
    if exists (select 1 from jsonb_array_elements_text(v_direction -> 'lead_ids') ids(id)
      where not exists (select 1 from public.offerpsp_leads l where l.lead_id = ids.id::uuid)) then raise exception 'Merchant not found'; end if;
    if exists (select 1 from jsonb_array_elements_text(v_direction -> 'task_ids') ids(id)
      where not exists (select 1 from public.offerpsp_tasks t where t.id = ids.id::uuid)) then raise exception 'Task not found'; end if;
  end loop;
  if (select count(*) <> count(distinct value ->> 'id') from jsonb_array_elements(p_plan -> 'directions')) then raise exception 'Duplicate direction IDs'; end if;

  -- Serialize first creation as well as updates; a stale tab must never overwrite another plan.
  perform pg_advisory_xact_lock(716403118);
  select * into v_row from private.offerpsp_course_plan where singleton for update;
  if coalesce(v_row.revision, 0) <> p_expected_revision then
    return jsonb_build_object('outcome','conflict','revision',v_row.revision,'plan',v_row.plan,'updated_at',v_row.updated_at);
  end if;
  insert into private.offerpsp_course_plan(singleton, revision, plan, updated_by)
    values (true, p_expected_revision + 1, p_plan, auth.uid())
    on conflict (singleton) do update set revision = excluded.revision, plan = excluded.plan,
      updated_by = excluded.updated_by, updated_at = now()
    returning * into v_row;
  insert into private.offerpsp_course_plan_history(revision, plan, actor_user_id)
    values (v_row.revision, v_row.plan, auth.uid());
  return jsonb_build_object('outcome','saved','revision',v_row.revision,'plan',v_row.plan,'updated_at',v_row.updated_at);
end;
$$;
revoke all on function public.get_offerpsp_course_plan() from public, anon, service_role;
revoke all on function public.save_offerpsp_course_plan(integer, jsonb) from public, anon, service_role;
grant execute on function public.get_offerpsp_course_plan(), public.save_offerpsp_course_plan(integer, jsonb) to authenticated;
