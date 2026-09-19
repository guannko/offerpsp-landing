-- Screening fences must react only to evidence-bearing applicant data.
-- Operational activity (Telegram delivery, email journal, task updates) touches
-- offerpsp_leads.updated_at/last_activity_at and must not cancel an in-flight run.
create or replace function private.offerpsp_pre_compliance_input_hash(
  p_lead public.offerpsp_leads
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select md5(jsonb_build_object(
    'company', p_lead.company,
    'contact_name', p_lead.name,
    'work_email', p_lead.work_email,
    'telegram', p_lead.telegram,
    'company_url', p_lead.company_url,
    'vertical', p_lead.vertical,
    'business_model', p_lead.business_model,
    'monthly_volume', p_lead.monthly_volume,
    'expected_monthly_volume', p_lead.expected_monthly_volume,
    'geos', p_lead.geos,
    'registration_geo', p_lead.registration_geo,
    'target_geos', p_lead.target_geos,
    'methods', p_lead.methods,
    'requested_methods', p_lead.requested_methods,
    'requested_currencies', p_lead.requested_currencies,
    'requested_flows', p_lead.requested_flows,
    'license_status', p_lead.license_status,
    'license_jurisdiction', p_lead.license_jurisdiction,
    'license_number', p_lead.license_number,
    'license_evidence_url', p_lead.license_evidence_url,
    'qualification_notes', p_lead.qualification_notes,
    'details', p_lead.details
  )::text)
$$;

revoke all on function private.offerpsp_pre_compliance_input_hash(public.offerpsp_leads)
  from public, anon, authenticated, service_role;

create or replace function public.claim_offerpsp_pre_compliance_jobs(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  if not private.offerpsp_module_enabled('pre_compliance') then
    return '[]'::jsonb;
  end if;

  with exhausted as (
    select c.id from private.offerpsp_compliance_cases c
    join public.offerpsp_leads l on l.lead_id = c.lead_id
    where c.case_status = 'screening' and c.screening_attempts >= 3
      and c.screening_lease_until <= now()
      and l.record_state = 'active' and l.status not in ('closed', 'spam', 'won', 'lost')
    for update of c skip locked
  ), stopped as (
    update private.offerpsp_compliance_cases c
    set case_status = 'manual_review', screening_run_id = null, screening_lease_until = null,
      summary = concat_ws(E'\n', c.summary, 'Автопроверка не завершилась после трёх попыток. Нужна ручная проверка; это не оценка риска компании.'),
      updated_at = now()
    from exhausted where c.id = exhausted.id returning c.id, c.lead_id
  )
  insert into public.offerpsp_lead_activities(lead_id, actor_type, activity_type, title, metadata)
  select lead_id, 'aibot', 'pre_compliance_worker_exhausted', 'Screening worker retry limit reached',
    jsonb_build_object('case_id', id, 'reason', 'lease_expired', 'attempts', 3) from stopped;

  with candidates as (
    select c.id, private.offerpsp_pre_compliance_input_hash(l) as input_hash
    from private.offerpsp_compliance_cases c
    join public.offerpsp_leads l on l.lead_id = c.lead_id
    where l.record_state = 'active'
      and l.status not in ('closed', 'spam', 'won', 'lost')
      and c.screening_attempts < 3
      and (c.case_status = 'pending'
        or (c.case_status = 'screening' and coalesce(c.screening_lease_until, c.updated_at + interval '30 minutes') <= now()))
    order by c.manual_requested_at nulls last, c.created_at, c.id
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update of c skip locked
  ), claimed as (
    update private.offerpsp_compliance_cases c
    set case_status = 'screening', manual_requested_at = null, updated_at = now(),
      screening_run_id = gen_random_uuid(), screening_lease_until = now() + interval '30 minutes',
      screening_input_hash = candidates.input_hash,
      screening_dispatch_started_at = null,
      screening_attempts = c.screening_attempts + 1
    from candidates
    where c.id = candidates.id
    returning c.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'case_id', c.id, 'lead_id', l.lead_id,
    'run_id', c.screening_run_id, 'lease_until', c.screening_lease_until, 'attempt', c.screening_attempts,
    'company', l.company, 'contact_name', l.name,
    'work_email', l.work_email, 'telegram', l.telegram,
    'company_url', l.company_url, 'vertical', l.vertical,
    'monthly_volume', l.monthly_volume, 'expected_monthly_volume', l.expected_monthly_volume,
    'geos', l.geos, 'target_geos', l.target_geos,
    'methods', l.methods, 'requested_methods', l.requested_methods,
    'requested_currencies', l.requested_currencies, 'requested_flows', l.requested_flows,
    'license_status', l.license_status, 'license_jurisdiction', l.license_jurisdiction,
    'license_number', l.license_number, 'license_evidence_url', l.license_evidence_url,
    'qualification_notes', l.qualification_notes,
    'details', l.details, 'source', l.source, 'submitted_at', l.submitted_at,
    'existing_classification', c.classification, 'existing_summary', c.summary
  ) order by c.created_at, c.id), '[]'::jsonb)
  into v_result
  from claimed c join public.offerpsp_leads l on l.lead_id = c.lead_id;
  return v_result;
end;
$$;

revoke all on function public.claim_offerpsp_pre_compliance_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_offerpsp_pre_compliance_jobs(integer) to service_role;

create or replace function public.complete_offerpsp_pre_compliance_run(
  p_lead_id uuid,
  p_run_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case private.offerpsp_compliance_cases%rowtype;
  v_lead public.offerpsp_leads%rowtype;
  v_result jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  if p_run_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 131072 then
    raise exception 'Invalid screening completion';
  end if;

  select * into v_lead from public.offerpsp_leads where lead_id = p_lead_id for update;
  select * into v_case from private.offerpsp_compliance_cases where lead_id = p_lead_id for update;
  if v_case.id is null then raise exception 'Pre-compliance case not found'; end if;
  if v_case.screening_completed_run_id = p_run_id then
    if v_case.screening_result_hash is distinct from md5(p_payload::text) then
      raise exception 'Screening replay payload mismatch';
    end if;
    return jsonb_build_object('case_id', v_case.id, 'lead_id', p_lead_id, 'run_id', p_run_id,
      'outcome', 'already_completed', 'status', v_case.case_status);
  end if;
  if v_case.screening_run_id is distinct from p_run_id or v_case.case_status <> 'screening'
    or v_case.screening_lease_until is null or v_case.screening_lease_until <= now()
    or v_case.screening_input_hash is distinct from private.offerpsp_pre_compliance_input_hash(v_lead)
    or v_lead.record_state <> 'active' or v_lead.status in ('closed', 'spam', 'won', 'lost') then
    return jsonb_build_object('lead_id', p_lead_id, 'run_id', p_run_id, 'outcome', 'stale_or_cancelled');
  end if;
  if not private.offerpsp_module_enabled('pre_compliance') then
    return jsonb_build_object('lead_id', p_lead_id, 'run_id', p_run_id, 'outcome', 'module_disabled');
  end if;

  v_result := public.record_offerpsp_pre_compliance_screening(p_lead_id,
    (p_payload - 'signals') || jsonb_build_object('screened_at', clock_timestamp()));
  update private.offerpsp_compliance_cases set
    case_status = 'manual_review', screening_completed_run_id = p_run_id,
    screening_result_hash = md5(p_payload::text), screening_run_id = null, screening_lease_until = null
    where id = v_case.id;
  return v_result || jsonb_build_object('status', 'manual_review', 'run_id', p_run_id, 'outcome', 'completed');
end;
$$;

revoke all on function public.complete_offerpsp_pre_compliance_run(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_offerpsp_pre_compliance_run(uuid, uuid, jsonb) to service_role;

create or replace function public.begin_offerpsp_pre_compliance_run(p_lead_id uuid, p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case private.offerpsp_compliance_cases%rowtype;
  v_lead public.offerpsp_leads%rowtype;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;
  if p_lead_id is null or p_run_id is null then raise exception 'Screening run identity required'; end if;
  select * into v_lead from public.offerpsp_leads where lead_id = p_lead_id for update;
  select * into v_case from private.offerpsp_compliance_cases where lead_id = p_lead_id for update;
  if v_case.id is null then return jsonb_build_object('outcome', 'stale_or_cancelled'); end if;
  if v_case.screening_completed_run_id = p_run_id then
    return jsonb_build_object('outcome', 'already_completed', 'lead_id', p_lead_id,
      'run_id', p_run_id, 'status', v_case.case_status);
  end if;
  if v_case.screening_run_id is distinct from p_run_id or v_case.case_status <> 'screening'
    or v_case.screening_lease_until is null or v_case.screening_lease_until <= now()
    or v_case.screening_input_hash is distinct from private.offerpsp_pre_compliance_input_hash(v_lead)
    or v_lead.record_state <> 'active' or v_lead.status in ('closed', 'spam', 'won', 'lost') then
    return jsonb_build_object('outcome', 'stale_or_cancelled');
  end if;
  if not private.offerpsp_module_enabled('pre_compliance') then
    return jsonb_build_object('outcome', 'module_disabled');
  end if;
  if v_case.screening_dispatch_started_at is not null then
    return jsonb_build_object('outcome', 'in_progress');
  end if;
  update private.offerpsp_compliance_cases set screening_dispatch_started_at = now() where id = v_case.id;
  return jsonb_build_object('outcome', 'acquired', 'job', to_jsonb(v_lead) || jsonb_build_object(
    'case_id', v_case.id,
    'run_id', p_run_id,
    'lease_until', v_case.screening_lease_until,
    'contact_name', v_lead.name,
    'representative_name', v_lead.name,
    'legal_name', v_lead.company,
    'registration_jurisdiction', v_lead.registration_geo,
    'existing_classification', v_case.classification,
    'existing_summary', v_case.summary
  ));
end;
$$;

revoke all on function public.begin_offerpsp_pre_compliance_run(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_offerpsp_pre_compliance_run(uuid, uuid) to service_role;

comment on function private.offerpsp_pre_compliance_input_hash(public.offerpsp_leads) is
  'Stable fence for evidence-bearing applicant fields. Operational timestamps and staff workflow metadata are deliberately excluded.';
