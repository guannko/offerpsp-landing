-- Snapshot of verified production RPC definitions and grants, 2026-09-16.
-- Emergency rollback only, NOT a forward migration. Disable worker token/flag and pause/drain
-- both n8n graphs before running. Retains v2 columns, evidence and receipts; deletes no data.
begin;
do $$ begin
  if exists(select 1 from private.offerpsp_compliance_cases where screening_run_id is not null and case_status = 'screening') then
    raise exception 'Drain or explicitly resolve active v2 runs before rollback';
  end if;
end; $$;
CREATE OR REPLACE FUNCTION public.claim_offerpsp_pre_compliance_jobs(p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_result jsonb;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'OfferPSP service access required';
  end if;

  with candidates as (
    select compliance_case.id
    from private.offerpsp_compliance_cases compliance_case
    join public.offerpsp_leads lead on lead.lead_id = compliance_case.lead_id
    where lead.record_state <> 'archived'
      and (
        compliance_case.manual_requested_at is not null
        or lead.status in (
          'option_selected',
          'dossier_ready',
          'provider_reviewing',
          'provider_needs_info',
          'provider_accepted',
          'telegram_created',
          'zoom_scheduled',
          'negotiating'
        )
      )
      and (
        compliance_case.case_status = 'pending'
        or (
          compliance_case.case_status = 'screening'
          and compliance_case.updated_at < now() - interval '30 minutes'
        )
      )
    order by
      compliance_case.manual_requested_at nulls last,
      compliance_case.created_at
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update of compliance_case skip locked
  ), claimed as (
    update private.offerpsp_compliance_cases compliance_case
    set case_status = 'screening',
        manual_requested_at = null,
        updated_at = now()
    from candidates
    where compliance_case.id = candidates.id
    returning compliance_case.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'case_id', compliance_case.id,
    'lead_id', lead.lead_id,
    'company', lead.company,
    'contact_name', lead.name,
    'work_email', lead.work_email,
    'telegram', lead.telegram,
    'company_url', lead.company_url,
    'vertical', lead.vertical,
    'monthly_volume', lead.monthly_volume,
    'geos', lead.geos,
    'target_geos', lead.target_geos,
    'methods', lead.methods,
    'requested_methods', lead.requested_methods,
    'details', lead.details,
    'source', lead.source,
    'submitted_at', lead.submitted_at,
    'existing_classification', compliance_case.classification,
    'existing_summary', compliance_case.summary
  ) order by compliance_case.created_at), '[]'::jsonb)
  into v_result
  from claimed compliance_case
  join public.offerpsp_leads lead on lead.lead_id = compliance_case.lead_id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.queue_offerpsp_pre_compliance_screening(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_case private.offerpsp_compliance_cases%rowtype;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  if not exists (
    select 1
    from public.offerpsp_leads lead
    where lead.lead_id = p_lead_id
      and lead.record_state <> 'archived'
  ) then
    raise exception 'Active OfferPSP lead not found';
  end if;

  update private.offerpsp_compliance_cases compliance_case
  set case_status = 'pending',
      manual_requested_at = now(),
      updated_at = now()
  where compliance_case.lead_id = p_lead_id
  returning compliance_case.* into v_case;

  if v_case.id is null then
    raise exception 'Pre-compliance case not found';
  end if;

  insert into public.offerpsp_lead_activities(
    lead_id, actor_type, activity_type, title, metadata
  ) values (
    p_lead_id,
    'staff',
    'pre_compliance_requested',
    'Manual pre-compliance screening requested',
    jsonb_build_object('case_id', v_case.id)
  );

  return jsonb_build_object(
    'case_id', v_case.id,
    'lead_id', v_case.lead_id,
    'status', v_case.case_status,
    'manual_requested_at', v_case.manual_requested_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_offerpsp_pre_compliance_screening(p_lead_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
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
$function$;
revoke all on function public.claim_offerpsp_pre_compliance_jobs(integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_offerpsp_pre_compliance_jobs(integer) to service_role;
revoke all on function public.queue_offerpsp_pre_compliance_screening(uuid) from public, anon, authenticated, service_role;
grant execute on function public.queue_offerpsp_pre_compliance_screening(uuid) to authenticated, service_role;
revoke all on function public.record_offerpsp_pre_compliance_screening(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_offerpsp_pre_compliance_screening(uuid, jsonb) to service_role;
revoke all on function public.begin_offerpsp_pre_compliance_run(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.complete_offerpsp_pre_compliance_run(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
commit;
