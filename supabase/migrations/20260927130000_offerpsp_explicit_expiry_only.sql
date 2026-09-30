-- OfferPSP offers do not age out merely because time has passed.
-- Staff updates offers when new partner information arrives. The only automatic
-- stale state retained by the provider portal is an explicit route expiry date.

create or replace function public.get_offerpsp_provider_portal_workspace(p_provider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
begin
  if not private.is_offerpsp_provider_member(p_provider_id) then raise exception 'PSP workspace access required'; end if;
  return jsonb_build_object(
    'provider', (select jsonb_build_object('id', p.id, 'internal_code', p.internal_code, 'brand_name', p.brand_name, 'legal_name', p.legal_name, 'website', p.website, 'relationship_status', p.relationship_status, 'last_verified_at', p.last_verified_at, 'created_at', p.created_at, 'updated_at', p.updated_at) from private.offerpsp_providers p where p.id = p_provider_id),
    'profile', coalesce((select to_jsonb(d) - 'updated_by' from public.offerpsp_provider_profile_details d where d.provider_id = p_provider_id), '{}'::jsonb),
    'membership', (select jsonb_build_object('id', m.id, 'role', m.role) from public.offerpsp_provider_memberships m where m.provider_id = p_provider_id and m.user_id = auth.uid() and m.active),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c) - 'notes' order by c.active desc, c.updated_at desc) from private.offerpsp_provider_contacts c where c.provider_id = p_provider_id), '[]'::jsonb),
    'updates', coalesce((select jsonb_agg(to_jsonb(u) - 'review_note' order by u.created_at desc) from public.offerpsp_provider_updates u where u.provider_id = p_provider_id), '[]'::jsonb),
    'ingestion_jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'source_type', j.source_type, 'source_reference', j.source_reference, 'source_metadata', j.source_metadata, 'status', j.status, 'route_count', j.route_count, 'blocking_anomaly_count', j.blocking_anomaly_count, 'error_message', j.error_message, 'received_at', j.received_at, 'processed_at', j.processed_at) order by j.received_at desc) from (select * from private.offerpsp_ingestion_jobs where provider_id = p_provider_id order by received_at desc limit 50) j), '[]'::jsonb),
    'drafts', coalesce((select jsonb_agg(to_jsonb(d) order by d.updated_at desc) from public.offerpsp_provider_offer_drafts d where d.provider_id = p_provider_id), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg((to_jsonb(r) - 'raw_block') || jsonb_build_object('batch_version', b.batch_version, 'batch_status', b.status, 'source_effective_date', b.source_effective_date, 'fees', coalesce((select jsonb_agg(to_jsonb(f) order by f.flow, f.created_at) from private.offerpsp_offer_fee_components f where f.route_id = r.id), '[]'::jsonb), 'limits', coalesce((select jsonb_agg(to_jsonb(l) order by l.flow, l.currency) from private.offerpsp_offer_limits l where l.route_id = r.id), '[]'::jsonb), 'settlements', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from private.offerpsp_settlement_terms s where s.route_id = r.id), '[]'::jsonb), 'is_stale', (r.expires_at is not null and r.expires_at < current_date)) order by r.updated_at desc) from private.offerpsp_offer_routes r join private.offerpsp_rate_card_batches b on b.id = r.batch_id where r.provider_id = p_provider_id and r.status <> 'archived'), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_offerpsp_provider_portal_workspace(uuid) is
  'Returns the private PSP workspace. Route staleness is driven only by an explicit expires_at date; source and verification dates are informational.';
