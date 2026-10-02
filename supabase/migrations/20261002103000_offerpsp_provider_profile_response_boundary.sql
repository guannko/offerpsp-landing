-- Keep the PSP mutation response consistent with the safe read projection.
-- No membership, commercial terms, stored notes or publication rules change.
CREATE OR REPLACE FUNCTION public.save_offerpsp_provider_portal_profile(p_provider_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_before private.offerpsp_providers;
  v_after private.offerpsp_providers;
  v_details public.offerpsp_provider_profile_details;
begin
  if not private.is_offerpsp_provider_member(p_provider_id, array['owner','admin','editor']) then
    raise exception 'PSP manager access required';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then raise exception 'Profile payload must be an object'; end if;
  select * into v_before from private.offerpsp_providers where id = p_provider_id for update;
  if not found then raise exception 'PSP provider not found'; end if;
  if nullif(trim(p_payload ->> 'brand_name'), '') is null then raise exception 'PSP brand name is required'; end if;

  update private.offerpsp_providers
  set brand_name = trim(p_payload ->> 'brand_name'),
      legal_name = nullif(trim(p_payload ->> 'legal_name'), ''),
      website = nullif(trim(p_payload ->> 'website'), ''),
      updated_at = now()
  where id = p_provider_id returning * into v_after;

  insert into public.offerpsp_provider_profile_details(
    provider_id, company_description, headquarters_country, founded_year,
    operating_geos, supported_currencies, payment_methods, card_schemes,
    supported_verticals, prohibited_verticals, integrations, settlement_currencies,
    support_languages, licences, compliance_summary, onboarding_requirements,
    onboarding_sla, api_docs_url, public_summary, updated_by
  ) values (
    p_provider_id, nullif(trim(p_payload ->> 'company_description'), ''),
    nullif(upper(trim(p_payload ->> 'headquarters_country')), ''),
    private.offerpsp_jsonb_numeric(p_payload, 'founded_year')::integer,
    private.offerpsp_jsonb_text_array(p_payload -> 'operating_geos'),
    private.offerpsp_jsonb_text_array(p_payload -> 'supported_currencies'),
    private.offerpsp_jsonb_text_array(p_payload -> 'payment_methods'),
    private.offerpsp_jsonb_text_array(p_payload -> 'card_schemes'),
    private.offerpsp_jsonb_text_array(p_payload -> 'supported_verticals'),
    private.offerpsp_jsonb_text_array(p_payload -> 'prohibited_verticals'),
    private.offerpsp_jsonb_text_array(p_payload -> 'integrations'),
    private.offerpsp_jsonb_text_array(p_payload -> 'settlement_currencies'),
    private.offerpsp_jsonb_text_array(p_payload -> 'support_languages'),
    case when jsonb_typeof(p_payload -> 'licences') = 'array' then p_payload -> 'licences' else '[]'::jsonb end,
    nullif(trim(p_payload ->> 'compliance_summary'), ''),
    nullif(trim(p_payload ->> 'onboarding_requirements'), ''),
    nullif(trim(p_payload ->> 'onboarding_sla'), ''),
    nullif(trim(p_payload ->> 'api_docs_url'), ''),
    nullif(trim(p_payload ->> 'public_summary'), ''), auth.uid()
  )
  on conflict (provider_id) do update set
    company_description = excluded.company_description,
    headquarters_country = excluded.headquarters_country,
    founded_year = excluded.founded_year,
    operating_geos = excluded.operating_geos,
    supported_currencies = excluded.supported_currencies,
    payment_methods = excluded.payment_methods,
    card_schemes = excluded.card_schemes,
    supported_verticals = excluded.supported_verticals,
    prohibited_verticals = excluded.prohibited_verticals,
    integrations = excluded.integrations,
    settlement_currencies = excluded.settlement_currencies,
    support_languages = excluded.support_languages,
    licences = excluded.licences,
    compliance_summary = excluded.compliance_summary,
    onboarding_requirements = excluded.onboarding_requirements,
    onboarding_sla = excluded.onboarding_sla,
    api_docs_url = excluded.api_docs_url,
    public_summary = excluded.public_summary,
    updated_by = auth.uid(), updated_at = now()
  returning * into v_details;

  insert into private.offerpsp_supply_activities(provider_id, actor_user_id, action_type, summary, before_state, after_state)
  values (p_provider_id, auth.uid(), 'provider_profile_updated', 'PSP profile updated through provider portal', to_jsonb(v_before), to_jsonb(v_after) || jsonb_build_object('details', to_jsonb(v_details)));
  return jsonb_build_object(
    'provider', jsonb_build_object(
      'id', v_after.id, 'internal_code', v_after.internal_code,
      'brand_name', v_after.brand_name, 'legal_name', v_after.legal_name,
      'website', v_after.website, 'relationship_status', v_after.relationship_status,
      'last_verified_at', v_after.last_verified_at,
      'created_at', v_after.created_at, 'updated_at', v_after.updated_at
    ),
    'profile', to_jsonb(v_details) - 'updated_by'
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.save_offerpsp_provider_portal_profile(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_offerpsp_provider_portal_profile(uuid,jsonb) TO authenticated, service_role;
