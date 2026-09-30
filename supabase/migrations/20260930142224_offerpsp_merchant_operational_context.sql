-- Narrow, staff-only context for UI/MCP consistency. No service token is used.
create or replace function public.get_offerpsp_merchant_operational_context(p_lead_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_lead public.offerpsp_leads;
  v_compliance jsonb;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required' using errcode='42501';
  end if;
  select * into v_lead from public.offerpsp_leads where lead_id=p_lead_id;
  if not found then raise exception 'OfferPSP merchant not found'; end if;
  if not private.offerpsp_module_enabled('pre_compliance') then
    v_compliance := jsonb_build_object('loaded',false,'reason','module_disabled');
  elsif not exists(select 1 from private.offerpsp_compliance_cases where lead_id=p_lead_id) then
    v_compliance := jsonb_build_object('loaded',true,'case',null,'reason','case_not_found');
  else
    v_compliance := public.get_offerpsp_pre_compliance_case(p_lead_id)||jsonb_build_object('loaded',true);
  end if;
  -- Read the saved legal profile without the UI's ensure/create side effect.
  -- The existing reader also resolves retained organization aliases.
  return jsonb_build_object('lead',to_jsonb(v_lead),'compliance',v_compliance,
    'company_workspace',public.get_offerpsp_company_workspace(p_lead_id));
end;
$$;
revoke all on function public.get_offerpsp_merchant_operational_context(uuid) from public,anon,service_role;
grant execute on function public.get_offerpsp_merchant_operational_context(uuid) to authenticated;

-- SQL NULL must never mean "compatible" at a QA/production boundary.
-- Two ordinary entities (both NULL) or the exact same registered scenario pass.
create or replace function private.offerpsp_qa_pair_is_compatible(p_lead_id uuid,p_provider_id uuid)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare v_merchant_scenario text; v_provider_scenario text;
begin
  v_merchant_scenario := private.offerpsp_qa_scenario_for_entity('merchant',p_lead_id);
  v_provider_scenario := private.offerpsp_qa_scenario_for_entity('provider',p_provider_id);
  return v_merchant_scenario is not distinct from v_provider_scenario;
end;
$$;
revoke all on function private.offerpsp_qa_pair_is_compatible(uuid,uuid) from public,anon,authenticated,service_role;
