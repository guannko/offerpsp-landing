-- Keep the operational PSP registry and the AIBot research registry connected,
-- and allow staff to request pre-compliance screening without changing the
-- automatic post-selection screening policy.

alter table private.offerpsp_compliance_cases
  add column if not exists manual_requested_at timestamptz;

create index if not exists offerpsp_compliance_cases_manual_queue_idx
  on private.offerpsp_compliance_cases(manual_requested_at, created_at)
  where manual_requested_at is not null;

create or replace function public.queue_offerpsp_pre_compliance_screening(
  p_lead_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
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
$$;

revoke all on function public.queue_offerpsp_pre_compliance_screening(uuid)
  from public, anon;
grant execute on function public.queue_offerpsp_pre_compliance_screening(uuid)
  to authenticated;

create or replace function public.claim_offerpsp_pre_compliance_jobs(
  p_limit integer default 10
)
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
$$;

revoke all on function public.claim_offerpsp_pre_compliance_jobs(integer)
  from public, anon, authenticated;
grant execute on function public.claim_offerpsp_pre_compliance_jobs(integer)
  to service_role;

-- Link the canonical operational BR-Pay card to its research record. The UI
-- also de-duplicates by normalized identity, so future imports cannot render a
-- second card while the link is being reviewed.
do $$
declare
  v_legacy_psp_id bigint;
begin
  select provider.id
  into v_legacy_psp_id
  from public.psp_providers provider
  where regexp_replace(lower(provider.name), '[^a-z0-9]+', '', 'g') = 'brpay'
  order by provider.id
  limit 1;

  if v_legacy_psp_id is not null then
    update private.offerpsp_providers provider
    set legacy_psp_id = v_legacy_psp_id,
        updated_at = now()
    where regexp_replace(lower(provider.brand_name), '[^a-z0-9]+', '', 'g') = 'brpay'
      and provider.legacy_psp_id is distinct from v_legacy_psp_id;
  end if;
end;
$$;

comment on function public.queue_offerpsp_pre_compliance_screening(uuid) is
  'Queues one active lead for explicit staff-requested background screening.';

comment on function public.claim_offerpsp_pre_compliance_jobs(integer) is
  'Claims deferred post-selection screenings and explicit staff-requested screenings.';
