create or replace function public.get_offerpsp_search_index_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lead_id', lead.lead_id,
        'company', lead.company,
        'name', lead.name,
        'work_email', lead.work_email,
        'telegram', lead.telegram,
        'company_url', lead.company_url,
        'vertical', lead.vertical,
        'geos', lead.geos,
        'target_geos', lead.target_geos,
        'requested_currencies', lead.requested_currencies,
        'methods', lead.methods,
        'requested_methods', lead.requested_methods,
        'status', lead.status,
        'record_state', lead.record_state,
        'submitted_at', lead.submitted_at,
        'updated_at', lead.updated_at
      ) order by lead.submitted_at desc)
      from public.offerpsp_leads as lead
    ), '[]'::jsonb),
    'management', jsonb_build_object(
      'providers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', provider.id,
          'internal_code', provider.internal_code,
          'legacy_psp_id', provider.legacy_psp_id,
          'legal_name', provider.legal_name,
          'brand_name', provider.brand_name,
          'website', provider.website,
          'relationship_status', provider.relationship_status,
          'last_verified_at', provider.last_verified_at,
          'updated_at', provider.updated_at,
          'record_state', case when provider.archived_at is null then 'active' else 'archived' end
        ) order by provider.brand_name nulls last)
        from private.offerpsp_providers as provider
      ), '[]'::jsonb),
      'organizations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', organization.id,
          'organization_type', organization.organization_type,
          'name', organization.name,
          'legal_name', organization.legal_name,
          'website', organization.website_url,
          'email', organization.brand_support_email,
          'telegram', null,
          'status', organization.status,
          'notes', organization.relationship_notes,
          'created_at', organization.created_at,
          'updated_at', organization.updated_at
        ) order by organization.name)
        from public.offerpsp_organizations as organization
        where organization.organization_type = 'agent'
      ), '[]'::jsonb)
    ),
    'coverage', jsonb_build_object(
      'routes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'route_id', route.id,
          'provider_id', route.provider_id,
          'route_code', route.internal_code,
          'client_title', route.client_title,
          'coverage_scope', route.coverage_scope,
          'coverage_mode', route.coverage_mode,
          'geos', route.geos,
          'blocked_geos', route.blocked_geos,
          'currencies', route.currencies,
          'flow', route.flow,
          'methods', route.methods,
          'card_brands', route.card_brands,
          'traffic_types', route.traffic_types,
          'verticals', route.verticals,
          'integrations', route.integrations,
          'risk_segments', route.risk_segments,
          'status', route.status,
          'updated_at', route.updated_at,
          'provider_code', provider.internal_code,
          'provider_name', provider.brand_name
        ) order by route.updated_at desc)
        from private.offerpsp_offer_routes as route
        join private.offerpsp_providers as provider on provider.id = route.provider_id
      ), '[]'::jsonb)
    ),
    'captains_bridge', jsonb_build_object(
      'casino_leads', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', casino.id,
          'name', casino.name,
          'website', casino.website,
          'geo', casino.geo,
          'city', casino.city,
          'license', casino.license,
          'sphere', casino.sphere,
          'email', casino.email,
          'telegram', casino.telegram,
          'contact_name', casino.contact_name,
          'tags', casino.tags,
          'contact_status', casino.contact_status,
          'record_state', casino.record_state,
          'created_at', casino.created_at,
          'updated_at', casino.updated_at
        ) order by casino.updated_at desc nulls last)
        from public.casino_leads as casino
      ), '[]'::jsonb),
      'psp_providers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', provider.id,
          'name', provider.name,
          'website', provider.website,
          'geo', provider.geo,
          'cluster', provider.cluster,
          'specialization', provider.specialization,
          'methods', provider.methods,
          'email', provider.email,
          'telegram', provider.telegram,
          'supported_countries', provider.supported_countries,
          'supported_currencies', provider.supported_currencies,
          'payment_methods', provider.payment_methods,
          'contact_status', provider.contact_status,
          'provider_status', provider.provider_status,
          'record_state', provider.record_state,
          'created_at', provider.created_at,
          'updated_at', provider.updated_at
        ) order by provider.updated_at desc nulls last)
        from public.psp_providers as provider
      ), '[]'::jsonb)
    )
  );
$function$;

revoke all on function public.get_offerpsp_search_index_snapshot() from public;
revoke all on function public.get_offerpsp_search_index_snapshot() from anon;
revoke all on function public.get_offerpsp_search_index_snapshot() from authenticated;
grant execute on function public.get_offerpsp_search_index_snapshot() to service_role;
