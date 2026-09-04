-- Do not screen a new merchant before showing matching payment options.
-- Background intelligence starts only after the client selects an option,
-- when it becomes relevant for a controlled PSP introduction.

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
      and lead.status in (
        'option_selected',
        'dossier_ready',
        'provider_reviewing',
        'provider_needs_info',
        'provider_accepted',
        'telegram_created',
        'zoom_scheduled',
        'negotiating'
      )
      and (
        compliance_case.case_status = 'pending'
        or (
          compliance_case.case_status = 'screening'
          and compliance_case.updated_at < now() - interval '30 minutes'
        )
      )
    order by compliance_case.created_at
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update of compliance_case skip locked
  ), claimed as (
    update private.offerpsp_compliance_cases compliance_case
    set case_status = 'screening', updated_at = now()
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

comment on function public.claim_offerpsp_pre_compliance_jobs(integer) is
  'Claims background screening only after a client selected an option; new leads receive their shortlist without a verification delay.';
