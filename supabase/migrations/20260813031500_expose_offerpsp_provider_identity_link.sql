create or replace function public.list_offerpsp_supply()
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

  return jsonb_build_object(
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'legacy_psp_id', p.legacy_psp_id,
        'internal_code', p.internal_code,
        'brand_name', p.brand_name,
        'legal_name', p.legal_name,
        'website', p.website,
        'relationship_status', p.relationship_status,
        'strategic_priority', p.strategic_priority,
        'margin_included_default', p.margin_included_default,
        'last_verified_at', p.last_verified_at,
        'batch_count', (select count(*) from private.offerpsp_rate_card_batches b where b.provider_id = p.id),
        'published_route_count', (select count(*) from private.offerpsp_offer_routes r where r.provider_id = p.id and r.status = 'published')
      ) order by p.strategic_priority desc, p.brand_name)
      from private.offerpsp_providers p
      where p.relationship_status <> 'archived'
    ), '[]'::jsonb),
    'batches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'provider_id', b.provider_id,
        'provider_code', p.internal_code,
        'provider_name', p.brand_name,
        'batch_version', b.batch_version,
        'source_type', b.source_type,
        'source_reference', b.source_reference,
        'source_effective_date', b.source_effective_date,
        'received_at', b.received_at,
        'status', b.status,
        'parser_version', b.parser_version,
        'route_count', (select count(*) from private.offerpsp_offer_routes r where r.batch_id = b.id),
        'open_anomaly_count', (select count(*) from private.offerpsp_route_anomalies a where a.batch_id = b.id and a.status = 'open')
      ) order by b.received_at desc)
      from private.offerpsp_rate_card_batches b
      join private.offerpsp_providers p on p.id = b.provider_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.list_offerpsp_supply() from public, anon;
grant execute on function public.list_offerpsp_supply() to authenticated;

comment on function public.list_offerpsp_supply() is
  'Staff supply registry including the internal link to the matching AIBot research PSP record.';
