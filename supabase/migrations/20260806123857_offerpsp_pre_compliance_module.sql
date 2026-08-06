create table if not exists private.offerpsp_module_catalog (
  module_key text primary key,
  name text not null,
  description text,
  minimum_plan text not null default 'pro'
    check (minimum_plan in ('core', 'pro', 'enterprise')),
  version text not null default '1.0.0',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.offerpsp_module_entitlements (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'offerpsp',
  module_key text not null references private.offerpsp_module_catalog(module_key) on delete restrict,
  plan text not null default 'pro' check (plan in ('core', 'pro', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'trial', 'suspended', 'expired')),
  enabled boolean not null default true,
  valid_until timestamptz,
  configuration jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_key, module_key)
);

insert into private.offerpsp_module_catalog(module_key, name, description, minimum_plan, version)
values (
  'pre_compliance',
  'Lead Intelligence / Pre-Compliance',
  'Evidence-based intake screening, classification, readiness scoring and a guarded matching gate.',
  'pro',
  '1.0.0'
)
on conflict (module_key) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_plan = excluded.minimum_plan,
  version = excluded.version,
  active = true,
  updated_at = now();

insert into private.offerpsp_module_entitlements(
  workspace_key, module_key, plan, status, enabled, configuration, notes
)
values (
  'offerpsp',
  'pre_compliance',
  'pro',
  'active',
  true,
  jsonb_build_object(
    'manual_clearance_required', true,
    'block_shortlist_until_clearance', true,
    'retain_raw_ip', false
  ),
  'Brain Index / OfferPSP production entitlement'
)
on conflict (workspace_key, module_key) do update set
  plan = excluded.plan,
  status = excluded.status,
  enabled = excluded.enabled,
  configuration = excluded.configuration,
  notes = excluded.notes,
  updated_at = now();

create or replace function private.offerpsp_module_enabled(p_module_key text)
returns boolean
language sql
stable
security definer
set search_path = private, pg_catalog
as $$
  select exists (
    select 1
    from private.offerpsp_module_catalog catalog
    join private.offerpsp_module_entitlements entitlement
      on entitlement.module_key = catalog.module_key
    where catalog.module_key = p_module_key
      and catalog.active
      and entitlement.workspace_key = 'offerpsp'
      and entitlement.enabled
      and entitlement.status in ('active', 'trial')
      and (entitlement.valid_until is null or entitlement.valid_until > now())
  );
$$;

create table if not exists private.offerpsp_compliance_cases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.offerpsp_leads(lead_id) on delete cascade,
  case_status text not null default 'pending'
    check (case_status in ('pending', 'screening', 'needs_info', 'cleared', 'hold', 'rejected', 'spam')),
  classification text not null default 'unknown'
    check (classification in ('merchant', 'subagent', 'psp', 'consultant', 'other', 'unknown')),
  authenticity_score smallint check (authenticity_score between 0 and 100),
  compliance_readiness_score smallint check (compliance_readiness_score between 0 and 100),
  commercial_value_score smallint check (commercial_value_score between 0 and 100),
  completeness_score smallint check (completeness_score between 0 and 100),
  risk_level text not null default 'unknown'
    check (risk_level in ('low', 'medium', 'high', 'critical', 'unknown')),
  confidence numeric(5,2) check (confidence between 0 and 1),
  summary text,
  missing_information text[] not null default '{}',
  red_flags jsonb not null default '[]'::jsonb,
  yellow_flags jsonb not null default '[]'::jsonb,
  source_links jsonb not null default '[]'::jsonb,
  screening_provider text,
  last_screened_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offerpsp_compliance_cases_queue_idx
  on private.offerpsp_compliance_cases(case_status, risk_level, created_at);

create table if not exists private.offerpsp_compliance_checks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references private.offerpsp_compliance_cases(id) on delete cascade,
  check_key text not null,
  check_status text not null default 'unknown'
    check (check_status in ('passed', 'warning', 'failed', 'unknown', 'not_applicable')),
  title text not null,
  detail text,
  score smallint check (score between 0 and 100),
  source_url text,
  evidence jsonb not null default '{}'::jsonb,
  provider text not null default 'manual',
  automated boolean not null default false,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (case_id, check_key, provider)
);

create index if not exists offerpsp_compliance_checks_case_idx
  on private.offerpsp_compliance_checks(case_id, checked_at desc);

create table if not exists private.offerpsp_compliance_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references private.offerpsp_compliance_cases(id) on delete cascade,
  previous_status text,
  decision text not null
    check (decision in ('pending', 'needs_info', 'cleared', 'hold', 'rejected', 'spam')),
  classification text not null,
  notes text,
  missing_information text[] not null default '{}',
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists offerpsp_compliance_decisions_case_idx
  on private.offerpsp_compliance_decisions(case_id, created_at desc);

create table if not exists private.offerpsp_submission_signals (
  lead_id uuid primary key references public.offerpsp_leads(lead_id) on delete cascade,
  ip_hash text,
  country_code text,
  network_name text,
  user_agent text,
  referrer text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.offerpsp_compliance_ready(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, pg_catalog
as $$
  select case
    when not private.offerpsp_module_enabled('pre_compliance') then true
    else coalesce((
      select case_status = 'cleared'
      from private.offerpsp_compliance_cases
      where lead_id = p_lead_id
    ), false)
  end;
$$;

create or replace function private.offerpsp_initialize_pre_compliance()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_case_id uuid;
begin
  if not private.offerpsp_module_enabled('pre_compliance') then
    return new;
  end if;

  update public.offerpsp_leads
  set target_geos = case
        when cardinality(target_geos) = 0 then private.offerpsp_extract_geo_codes(geos)
        else target_geos
      end,
      requested_methods = case
        when cardinality(requested_methods) = 0 then private.offerpsp_extract_methods(methods)
        else requested_methods
      end,
      updated_at = now()
  where lead_id = new.lead_id;

  insert into private.offerpsp_compliance_cases(lead_id, case_status, completeness_score, summary)
  values (
    new.lead_id,
    case when new.status = 'spam' then 'spam' else 'pending' end,
    least(100, greatest(0,
      (case when nullif(trim(new.company_url), '') is not null then 20 else 0 end)
      + (case when nullif(trim(new.work_email), '') is not null then 15 else 0 end)
      + (case when nullif(trim(new.geos), '') is not null then 15 else 0 end)
      + (case when nullif(trim(new.methods), '') is not null then 15 else 0 end)
      + (case when nullif(trim(new.monthly_volume), '') is not null then 15 else 0 end)
      + (case when length(trim(coalesce(new.details, ''))) >= 40 then 20 else 0 end)
    )),
    'Новая заявка ожидает проверки подлинности, роли компании и готовности к PSP review.'
  )
  on conflict (lead_id) do nothing
  returning id into v_case_id;

  if v_case_id is not null and new.status <> 'spam' then
    insert into public.offerpsp_tasks(
      lead_id, source, title, details, status, priority, due_at, metadata
    ) values (
      new.lead_id,
      'system',
      'Проверить новую заявку: ' || new.company,
      'Проверить домен, контакт, роль компании, лицензию и недостающие данные до matching.',
      'pending',
      'high',
      now() + interval '4 hours',
      jsonb_build_object('module', 'pre_compliance', 'case_id', v_case_id)
    );

    insert into public.offerpsp_lead_activities(
      lead_id, actor_type, activity_type, title, metadata
    ) values (
      new.lead_id,
      'system',
      'pre_compliance_opened',
      'Pre-compliance screening opened',
      jsonb_build_object('case_id', v_case_id, 'module', 'pre_compliance')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists offerpsp_lead_auto_match on public.offerpsp_leads;
drop trigger if exists offerpsp_lead_pre_compliance on public.offerpsp_leads;
create trigger offerpsp_lead_pre_compliance
after insert on public.offerpsp_leads
for each row execute function private.offerpsp_initialize_pre_compliance();

create or replace function private.offerpsp_guard_shortlist_compliance()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if new.status in ('draft', 'shared')
     and not private.offerpsp_compliance_ready(new.lead_id) then
    raise exception 'Pre-compliance clearance is required before creating or sharing a shortlist';
  end if;
  return new;
end;
$$;

drop trigger if exists offerpsp_shortlist_compliance_gate on public.offerpsp_shortlists;
create trigger offerpsp_shortlist_compliance_gate
before insert or update of status on public.offerpsp_shortlists
for each row execute function private.offerpsp_guard_shortlist_compliance();

create or replace function public.rebuild_offerpsp_route_matches(p_lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not private.offerpsp_compliance_ready(p_lead_id) then
    raise exception 'Pre-compliance clearance is required before matching';
  end if;
  return private.rebuild_offerpsp_route_matches_internal(p_lead_id);
end;
$$;

create or replace function public.get_offerpsp_module_entitlements()
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
    select jsonb_agg(jsonb_build_object(
      'module_key', catalog.module_key,
      'name', catalog.name,
      'description', catalog.description,
      'minimum_plan', catalog.minimum_plan,
      'version', catalog.version,
      'enabled', coalesce(entitlement.enabled, false)
        and coalesce(entitlement.status in ('active', 'trial'), false)
        and (entitlement.valid_until is null or entitlement.valid_until > now()),
      'plan', entitlement.plan,
      'status', entitlement.status,
      'valid_until', entitlement.valid_until,
      'configuration', coalesce(entitlement.configuration, '{}'::jsonb)
    ) order by catalog.name)
    from private.offerpsp_module_catalog catalog
    left join private.offerpsp_module_entitlements entitlement
      on entitlement.module_key = catalog.module_key
     and entitlement.workspace_key = 'offerpsp'
    where catalog.active
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_offerpsp_pre_compliance_registry()
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
  if not private.offerpsp_module_enabled('pre_compliance') then
    raise exception 'Pre-compliance module is not enabled';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'case_id', c.id,
      'lead_id', c.lead_id,
      'company', l.company,
      'contact_name', l.name,
      'work_email', l.work_email,
      'company_url', l.company_url,
      'vertical', l.vertical,
      'geos', l.geos,
      'target_geos', l.target_geos,
      'lead_status', l.status,
      'assigned_to', l.assigned_to,
      'case_status', c.case_status,
      'classification', c.classification,
      'authenticity_score', c.authenticity_score,
      'compliance_readiness_score', c.compliance_readiness_score,
      'commercial_value_score', c.commercial_value_score,
      'completeness_score', c.completeness_score,
      'risk_level', c.risk_level,
      'summary', c.summary,
      'missing_information', c.missing_information,
      'red_flag_count', jsonb_array_length(c.red_flags),
      'yellow_flag_count', jsonb_array_length(c.yellow_flags),
      'last_screened_at', c.last_screened_at,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    ) order by
      case c.case_status when 'pending' then 0 when 'screening' then 1 when 'needs_info' then 2 when 'hold' then 3 else 4 end,
      c.created_at desc)
    from private.offerpsp_compliance_cases c
    join public.offerpsp_leads l on l.lead_id = c.lead_id
    where l.record_state <> 'archived'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_offerpsp_pre_compliance_case(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_case private.offerpsp_compliance_cases;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not private.offerpsp_module_enabled('pre_compliance') then
    raise exception 'Pre-compliance module is not enabled';
  end if;
  select * into v_case from private.offerpsp_compliance_cases where lead_id = p_lead_id;
  if not found then raise exception 'Pre-compliance case not found'; end if;

  return jsonb_build_object(
    'case', to_jsonb(v_case),
    'signals', coalesce((select to_jsonb(s) from private.offerpsp_submission_signals s where s.lead_id = p_lead_id), '{}'::jsonb),
    'checks', coalesce((
      select jsonb_agg(to_jsonb(ch) order by ch.checked_at desc)
      from private.offerpsp_compliance_checks ch where ch.case_id = v_case.id
    ), '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from private.offerpsp_compliance_decisions d where d.case_id = v_case.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.record_offerpsp_pre_compliance_screening(
  p_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_case_id uuid;
  v_check jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Screening payload must be an object';
  end if;
  select id into v_case_id from private.offerpsp_compliance_cases where lead_id = p_lead_id for update;
  if v_case_id is null then raise exception 'Pre-compliance case not found'; end if;

  update private.offerpsp_compliance_cases
  set case_status = case when case_status in ('cleared', 'rejected', 'spam') then case_status else 'screening' end,
      classification = case
        when lower(trim(coalesce(p_payload ->> 'classification', ''))) in ('merchant', 'subagent', 'psp', 'consultant', 'other', 'unknown')
          then lower(trim(p_payload ->> 'classification'))
        else classification
      end,
      authenticity_score = case when p_payload ? 'authenticity_score' then private.offerpsp_jsonb_numeric(p_payload, 'authenticity_score')::smallint else authenticity_score end,
      compliance_readiness_score = case when p_payload ? 'compliance_readiness_score' then private.offerpsp_jsonb_numeric(p_payload, 'compliance_readiness_score')::smallint else compliance_readiness_score end,
      commercial_value_score = case when p_payload ? 'commercial_value_score' then private.offerpsp_jsonb_numeric(p_payload, 'commercial_value_score')::smallint else commercial_value_score end,
      completeness_score = case when p_payload ? 'completeness_score' then private.offerpsp_jsonb_numeric(p_payload, 'completeness_score')::smallint else completeness_score end,
      risk_level = case
        when lower(trim(coalesce(p_payload ->> 'risk_level', ''))) in ('low', 'medium', 'high', 'critical', 'unknown')
          then lower(trim(p_payload ->> 'risk_level'))
        else risk_level
      end,
      confidence = case when p_payload ? 'confidence' then private.offerpsp_jsonb_numeric(p_payload, 'confidence') else confidence end,
      summary = case when p_payload ? 'summary' then nullif(trim(p_payload ->> 'summary'), '') else summary end,
      missing_information = case when p_payload ? 'missing_information' then private.offerpsp_jsonb_text_array(p_payload -> 'missing_information') else missing_information end,
      red_flags = case when jsonb_typeof(p_payload -> 'red_flags') = 'array' then p_payload -> 'red_flags' else red_flags end,
      yellow_flags = case when jsonb_typeof(p_payload -> 'yellow_flags') = 'array' then p_payload -> 'yellow_flags' else yellow_flags end,
      source_links = case when jsonb_typeof(p_payload -> 'source_links') = 'array' then p_payload -> 'source_links' else source_links end,
      screening_provider = coalesce(nullif(trim(p_payload ->> 'screening_provider'), ''), screening_provider, 'n8n'),
      last_screened_at = coalesce(nullif(trim(p_payload ->> 'screened_at'), '')::timestamptz, now()),
      updated_at = now()
  where id = v_case_id;

  if jsonb_typeof(p_payload -> 'signals') = 'object' then
    insert into private.offerpsp_submission_signals(
      lead_id, ip_hash, country_code, network_name, user_agent, referrer, request_id, metadata
    ) values (
      p_lead_id,
      nullif(trim(p_payload #>> '{signals,ip_hash}'), ''),
      nullif(upper(trim(p_payload #>> '{signals,country_code}')), ''),
      nullif(trim(p_payload #>> '{signals,network_name}'), ''),
      nullif(left(p_payload #>> '{signals,user_agent}', 1000), ''),
      nullif(left(p_payload #>> '{signals,referrer}', 1000), ''),
      nullif(left(p_payload #>> '{signals,request_id}', 300), ''),
      coalesce(p_payload #> '{signals,metadata}', '{}'::jsonb)
    ) on conflict (lead_id) do update set
      ip_hash = excluded.ip_hash,
      country_code = excluded.country_code,
      network_name = excluded.network_name,
      user_agent = excluded.user_agent,
      referrer = excluded.referrer,
      request_id = excluded.request_id,
      metadata = excluded.metadata,
      updated_at = now();
  end if;

  if jsonb_typeof(p_payload -> 'checks') = 'array' then
    for v_check in select value from jsonb_array_elements(p_payload -> 'checks')
    loop
      insert into private.offerpsp_compliance_checks(
        case_id, check_key, check_status, title, detail, score,
        source_url, evidence, provider, automated, checked_at
      ) values (
        v_case_id,
        coalesce(nullif(trim(v_check ->> 'check_key'), ''), 'unknown'),
        case
          when lower(trim(coalesce(v_check ->> 'status', ''))) in ('passed', 'warning', 'failed', 'unknown', 'not_applicable')
            then lower(trim(v_check ->> 'status'))
          else 'unknown'
        end,
        coalesce(nullif(trim(v_check ->> 'title'), ''), 'Automated check'),
        nullif(trim(v_check ->> 'detail'), ''),
        private.offerpsp_jsonb_numeric(v_check, 'score')::smallint,
        nullif(trim(v_check ->> 'source_url'), ''),
        coalesce(v_check -> 'evidence', '{}'::jsonb),
        coalesce(nullif(trim(v_check ->> 'provider'), ''), 'n8n'),
        true,
        coalesce(nullif(trim(v_check ->> 'checked_at'), '')::timestamptz, now())
      ) on conflict (case_id, check_key, provider) do update set
        check_status = excluded.check_status,
        title = excluded.title,
        detail = excluded.detail,
        score = excluded.score,
        source_url = excluded.source_url,
        evidence = excluded.evidence,
        automated = true,
        checked_at = excluded.checked_at;
    end loop;
  end if;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_type, activity_type, title, metadata
  ) values (
    p_lead_id, 'aibot', 'pre_compliance_screened',
    'Automated pre-compliance screening completed',
    jsonb_build_object('case_id', v_case_id, 'provider', coalesce(p_payload ->> 'screening_provider', 'n8n'))
  );
  return jsonb_build_object(
    'case_id', v_case_id,
    'lead_id', p_lead_id,
    'status', (select case_status from private.offerpsp_compliance_cases where id = v_case_id)
  );
end;
$$;

create or replace function public.claim_offerpsp_pre_compliance_jobs(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;

  with candidates as (
    select c.id
    from private.offerpsp_compliance_cases c
    join public.offerpsp_leads l on l.lead_id = c.lead_id
    where l.record_state <> 'archived'
      and (
        c.case_status = 'pending'
        or (c.case_status = 'screening' and c.updated_at < now() - interval '30 minutes')
      )
    order by c.created_at
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update of c skip locked
  ), claimed as (
    update private.offerpsp_compliance_cases c
    set case_status = 'screening', updated_at = now()
    from candidates
    where c.id = candidates.id
    returning c.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'case_id', c.id,
    'lead_id', l.lead_id,
    'company', l.company,
    'contact_name', l.name,
    'work_email', l.work_email,
    'telegram', l.telegram,
    'company_url', l.company_url,
    'vertical', l.vertical,
    'monthly_volume', l.monthly_volume,
    'geos', l.geos,
    'target_geos', l.target_geos,
    'methods', l.methods,
    'requested_methods', l.requested_methods,
    'details', l.details,
    'source', l.source,
    'submitted_at', l.submitted_at,
    'existing_classification', c.classification,
    'existing_summary', c.summary
  ) order by c.created_at), '[]'::jsonb)
  into v_result
  from claimed c
  join public.offerpsp_leads l on l.lead_id = c.lead_id;

  return v_result;
end;
$$;

create or replace function public.save_offerpsp_pre_compliance_decision(
  p_lead_id uuid,
  p_decision text,
  p_classification text default 'unknown',
  p_notes text default null,
  p_missing_information text[] default null,
  p_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_case private.offerpsp_compliance_cases;
  v_next_lead_status text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_decision not in ('pending', 'needs_info', 'cleared', 'hold', 'rejected', 'spam') then
    raise exception 'Unsupported pre-compliance decision';
  end if;
  if p_classification not in ('merchant', 'subagent', 'psp', 'consultant', 'other', 'unknown') then
    raise exception 'Unsupported lead classification';
  end if;

  select * into v_case from private.offerpsp_compliance_cases where lead_id = p_lead_id for update;
  if not found then raise exception 'Pre-compliance case not found'; end if;

  update private.offerpsp_compliance_cases
  set case_status = p_decision,
      classification = p_classification,
      summary = coalesce(nullif(trim(p_summary), ''), summary),
      missing_information = coalesce(p_missing_information, missing_information),
      decided_at = case when p_decision in ('cleared', 'rejected', 'spam') then now() else null end,
      decided_by = auth.uid(),
      updated_at = now()
  where id = v_case.id;

  insert into private.offerpsp_compliance_decisions(
    case_id, previous_status, decision, classification, notes, missing_information, actor_user_id
  ) values (
    v_case.id, v_case.case_status, p_decision, p_classification,
    nullif(trim(p_notes), ''), coalesce(p_missing_information, v_case.missing_information), auth.uid()
  );

  v_next_lead_status := case
    when p_decision = 'needs_info' then 'needs_clarification'
    when p_decision = 'spam' then 'spam'
    when p_decision = 'rejected' then 'closed'
    when p_decision = 'cleared' then 'qualifying'
    else 'new'
  end;

  update public.offerpsp_leads
  set status = case
        when status in ('new', 'reviewing', 'qualifying', 'needs_clarification', 'matching', 'shortlist_ready')
          then v_next_lead_status
        else status
      end,
      business_model = case
        when p_classification in ('subagent', 'consultant') then p_classification
        else business_model
      end,
      qualification_notes = case
        when nullif(trim(p_notes), '') is not null then concat_ws(E'\n\n', qualification_notes, 'Pre-compliance: ' || trim(p_notes))
        else qualification_notes
      end,
      updated_at = now()
  where lead_id = p_lead_id;

  update public.offerpsp_tasks
  set status = case when p_decision in ('cleared', 'rejected', 'spam') then 'done' else status end,
      completed_at = case when p_decision in ('cleared', 'rejected', 'spam') then now() else completed_at end,
      updated_at = now()
  where lead_id = p_lead_id
    and metadata ->> 'module' = 'pre_compliance'
    and status in ('pending', 'in_progress');

  insert into public.offerpsp_lead_activities(
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata
  ) values (
    p_lead_id, auth.uid(), 'staff', 'pre_compliance_decision',
    'Pre-compliance decision: ' || p_decision,
    nullif(trim(p_notes), ''),
    jsonb_build_object('case_id', v_case.id, 'decision', p_decision, 'classification', p_classification)
  );
  return public.get_offerpsp_pre_compliance_case(p_lead_id);
end;
$$;

-- Backfill existing records without blocking deals that already progressed beyond qualification.
insert into private.offerpsp_compliance_cases(
  lead_id, case_status, classification, completeness_score, summary, decided_at
)
select
  l.lead_id,
  case
    when l.status = 'spam' then 'spam'
    when l.status in ('new', 'reviewing', 'qualifying', 'needs_clarification') then 'pending'
    when l.status = 'shortlist_ready' and exists (
      select 1 from public.offerpsp_shortlists s
      where s.lead_id = l.lead_id and s.status = 'draft' and s.created_by is null
        and not exists (
          select 1 from public.offerpsp_shortlist_items i
          where i.shortlist_id = s.id and i.offer_route_id is not null
        )
    ) then 'pending'
    when l.status in ('closed', 'lost') then 'rejected'
    else 'cleared'
  end,
  case
    when lower(coalesce(l.business_model, '')) like '%agent%' then 'subagent'
    when lower(coalesce(l.business_model, '')) like '%consult%' then 'consultant'
    else 'unknown'
  end,
  least(100, greatest(0,
    (case when nullif(trim(l.company_url), '') is not null then 20 else 0 end)
    + (case when nullif(trim(l.work_email), '') is not null then 15 else 0 end)
    + (case when nullif(trim(l.geos), '') is not null then 15 else 0 end)
    + (case when nullif(trim(l.methods), '') is not null then 15 else 0 end)
    + (case when nullif(trim(l.monthly_volume), '') is not null then 15 else 0 end)
    + (case when length(trim(coalesce(l.details, ''))) >= 40 then 20 else 0 end)
  )),
  case
    when l.status in ('new', 'reviewing', 'qualifying', 'needs_clarification', 'shortlist_ready')
      then 'Existing lead queued for pre-compliance review.'
    else 'Existing workflow state grandfathered at module activation; manual re-screen remains available.'
  end,
  case when l.status not in ('new', 'reviewing', 'qualifying', 'needs_clarification', 'shortlist_ready') then now() end
from public.offerpsp_leads l
on conflict (lead_id) do nothing;

update public.offerpsp_leads l
set target_geos = case when cardinality(l.target_geos) = 0 then private.offerpsp_extract_geo_codes(l.geos) else l.target_geos end,
    requested_methods = case when cardinality(l.requested_methods) = 0 then private.offerpsp_extract_methods(l.methods) else l.requested_methods end,
    status = case
      when l.status = 'shortlist_ready' and exists (
        select 1 from private.offerpsp_compliance_cases c
        where c.lead_id = l.lead_id and c.case_status = 'pending'
      ) then 'new'
      else l.status
    end,
    updated_at = now()
where cardinality(l.target_geos) = 0
   or cardinality(l.requested_methods) = 0
   or l.status = 'shortlist_ready';

update public.offerpsp_shortlists s
set status = 'archived'
where s.status = 'draft'
  and s.created_by is null
  and exists (
    select 1 from private.offerpsp_compliance_cases c
    where c.lead_id = s.lead_id and c.case_status = 'pending'
  )
  and not exists (
    select 1 from public.offerpsp_shortlist_items i
    where i.shortlist_id = s.id and i.offer_route_id is not null
  );

insert into public.offerpsp_tasks(
  lead_id, source, title, details, status, priority, due_at, metadata
)
select
  l.lead_id,
  'system',
  'Проверить заявку: ' || l.company,
  'Проверить домен, контакт, роль компании, лицензию и недостающие данные до matching.',
  'pending',
  'high',
  now() + interval '4 hours',
  jsonb_build_object('module', 'pre_compliance', 'case_id', c.id)
from private.offerpsp_compliance_cases c
join public.offerpsp_leads l on l.lead_id = c.lead_id
where c.case_status in ('pending', 'screening')
  and l.record_state <> 'archived'
  and not exists (
    select 1 from public.offerpsp_tasks t
    where t.lead_id = l.lead_id
      and t.metadata ->> 'module' = 'pre_compliance'
      and t.status in ('pending', 'in_progress')
  );

revoke all on table private.offerpsp_module_catalog from public, anon, authenticated;
revoke all on table private.offerpsp_module_entitlements from public, anon, authenticated;
revoke all on table private.offerpsp_compliance_cases from public, anon, authenticated;
revoke all on table private.offerpsp_compliance_checks from public, anon, authenticated;
revoke all on table private.offerpsp_compliance_decisions from public, anon, authenticated;
revoke all on table private.offerpsp_submission_signals from public, anon, authenticated;

grant all on table private.offerpsp_module_catalog to service_role;
grant all on table private.offerpsp_module_entitlements to service_role;
grant all on table private.offerpsp_compliance_cases to service_role;
grant all on table private.offerpsp_compliance_checks to service_role;
grant all on table private.offerpsp_compliance_decisions to service_role;
grant all on table private.offerpsp_submission_signals to service_role;

revoke all on function private.offerpsp_module_enabled(text) from public, anon, authenticated;
revoke all on function private.offerpsp_compliance_ready(uuid) from public, anon, authenticated;
revoke all on function private.offerpsp_initialize_pre_compliance() from public, anon, authenticated;
revoke all on function private.offerpsp_guard_shortlist_compliance() from public, anon, authenticated;
revoke all on function public.rebuild_offerpsp_route_matches(uuid) from public, anon;

revoke all on function public.get_offerpsp_module_entitlements() from public, anon;
revoke all on function public.get_offerpsp_pre_compliance_registry() from public, anon;
revoke all on function public.get_offerpsp_pre_compliance_case(uuid) from public, anon;
revoke all on function public.record_offerpsp_pre_compliance_screening(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_offerpsp_pre_compliance_jobs(integer) from public, anon, authenticated;
revoke all on function public.save_offerpsp_pre_compliance_decision(uuid, text, text, text, text[], text) from public, anon;

grant execute on function public.get_offerpsp_module_entitlements() to authenticated, service_role;
grant execute on function public.rebuild_offerpsp_route_matches(uuid) to authenticated, service_role;
grant execute on function public.get_offerpsp_pre_compliance_registry() to authenticated, service_role;
grant execute on function public.get_offerpsp_pre_compliance_case(uuid) to authenticated, service_role;
grant execute on function public.record_offerpsp_pre_compliance_screening(uuid, jsonb) to service_role;
grant execute on function public.claim_offerpsp_pre_compliance_jobs(integer) to service_role;
grant execute on function public.save_offerpsp_pre_compliance_decision(uuid, text, text, text, text[], text) to authenticated, service_role;

comment on table private.offerpsp_compliance_cases is
  'Paid PRO module: staff-only lead intelligence and pre-compliance gate before matching and shortlist creation.';
comment on function public.record_offerpsp_pre_compliance_screening(uuid, jsonb) is
  'Service-only ingestion endpoint for evidence-based screening results. It never auto-clears a lead.';
comment on function public.claim_offerpsp_pre_compliance_jobs(integer) is
  'Service-only work queue for the paid pre-compliance n8n worker. Stale claims are retried after 30 minutes.';
comment on function public.save_offerpsp_pre_compliance_decision(uuid, text, text, text, text[], text) is
  'Staff-only manual clearance decision and immutable decision history for the paid pre-compliance module.';
