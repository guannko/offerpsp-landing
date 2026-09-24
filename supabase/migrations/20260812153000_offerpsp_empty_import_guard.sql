alter function public.import_offerpsp_rate_card(
  text, text, text, text, date, text, jsonb, jsonb
) rename to import_offerpsp_rate_card_unguarded;

revoke all on function public.import_offerpsp_rate_card_unguarded(
  text, text, text, text, date, text, jsonb, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.import_offerpsp_rate_card(
  p_provider_code text,
  p_source_type text,
  p_source_text text,
  p_source_reference text default null,
  p_source_effective_date date default null,
  p_parser_version text default 'manual-v1',
  p_parser_metadata jsonb default '{}'::jsonb,
  p_routes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_ingestion_job_id text := nullif(trim(coalesce(p_parser_metadata, '{}'::jsonb) ->> 'ingestion_job_id'), '');
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  if jsonb_typeof(coalesce(p_routes, '[]'::jsonb)) <> 'array' then
    raise exception 'Routes payload must be a JSON array';
  end if;

  -- An unparsed source is retained for review but must never create a blank
  -- commercial version or supersede the provider's previous rate card.
  if jsonb_array_length(coalesce(p_routes, '[]'::jsonb)) = 0 then
    return jsonb_build_object(
      'batch_id', null,
      'provider_code', p_provider_code,
      'route_count', 0,
      'anomaly_count', 1,
      'status', 'review',
      'duplicate', false,
      'skipped_empty_import', true
    );
  end if;

  -- A previous parser attempt may have created a zero-route batch. Preserve
  -- it as audit history, but remove its idempotency key so the saved source
  -- can be processed again after a parser fix.
  if v_ingestion_job_id is not null then
    update private.offerpsp_rate_card_batches b
    set status = 'superseded',
        superseded_at = coalesce(b.superseded_at, now()),
        parser_metadata = b.parser_metadata - 'ingestion_job_id'
    where b.parser_metadata ->> 'ingestion_job_id' = v_ingestion_job_id
      and b.status in ('draft', 'review')
      and not exists (
        select 1
        from private.offerpsp_offer_routes r
        where r.batch_id = b.id
      );
  end if;

  return public.import_offerpsp_rate_card_unguarded(
    p_provider_code,
    p_source_type,
    p_source_text,
    p_source_reference,
    p_source_effective_date,
    p_parser_version,
    p_parser_metadata,
    p_routes
  );
end;
$$;

revoke all on function public.import_offerpsp_rate_card(
  text, text, text, text, date, text, jsonb, jsonb
) from public, anon;

grant execute on function public.import_offerpsp_rate_card(
  text, text, text, text, date, text, jsonb, jsonb
) to authenticated, service_role;

comment on function public.import_offerpsp_rate_card(
  text, text, text, text, date, text, jsonb, jsonb
) is 'Imports non-empty normalized rate cards; empty parser results remain review jobs and cannot supersede commercial versions.';
