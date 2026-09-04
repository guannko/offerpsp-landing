create or replace function public.update_offerpsp_client_dossier(
  p_lead_id uuid,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_dossier private.offerpsp_merchant_dossiers;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not (public.is_offerpsp_staff() or public.can_access_offerpsp_client_lead(p_lead_id)) then
    raise exception 'OfferPSP request not found';
  end if;
  if jsonb_typeof(coalesce(p_profile, '{}'::jsonb)) <> 'object' then
    raise exception 'Merchant profile must be a JSON object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_profile, '{}'::jsonb)) as supplied(key)
    where supplied.key <> all (array[
      'company', 'name', 'telegram', 'company_url', 'registration_geo',
      'target_geos', 'vertical', 'business_model', 'license_status',
      'license_jurisdiction', 'license_number', 'license_evidence_url',
      'expected_monthly_volume', 'volume_currency', 'requested_currencies',
      'requested_methods', 'requested_flows', 'traffic_types',
      'min_transaction_amount', 'max_transaction_amount',
      'transaction_currency', 'launch_timeline', 'current_processing_setup'
    ])
  ) then
    raise exception 'Merchant profile contains unsupported fields';
  end if;
  if (p_profile ? 'target_geos' and jsonb_typeof(p_profile -> 'target_geos') <> 'array')
    or (p_profile ? 'requested_currencies' and jsonb_typeof(p_profile -> 'requested_currencies') <> 'array')
    or (p_profile ? 'requested_methods' and jsonb_typeof(p_profile -> 'requested_methods') <> 'array')
    or (p_profile ? 'requested_flows' and jsonb_typeof(p_profile -> 'requested_flows') <> 'array')
    or (p_profile ? 'traffic_types' and jsonb_typeof(p_profile -> 'traffic_types') <> 'array') then
    raise exception 'Merchant profile list fields must be arrays';
  end if;

  update public.offerpsp_leads
  set
    company = case when p_profile ? 'company' then coalesce(nullif(trim(p_profile ->> 'company'), ''), company) else company end,
    name = case when p_profile ? 'name' then coalesce(nullif(trim(p_profile ->> 'name'), ''), name) else name end,
    telegram = case when p_profile ? 'telegram' then nullif(trim(p_profile ->> 'telegram'), '') else telegram end,
    company_url = case when p_profile ? 'company_url' then nullif(trim(p_profile ->> 'company_url'), '') else company_url end,
    registration_geo = case when p_profile ? 'registration_geo' then upper(nullif(trim(p_profile ->> 'registration_geo'), '')) else registration_geo end,
    target_geos = case when p_profile ? 'target_geos' then array(
      select distinct upper(trim(value))
      from jsonb_array_elements_text(p_profile -> 'target_geos')
      where nullif(trim(value), '') is not null
    ) else target_geos end,
    vertical = case when p_profile ? 'vertical' then coalesce(nullif(trim(p_profile ->> 'vertical'), ''), vertical) else vertical end,
    business_model = case when p_profile ? 'business_model' then nullif(trim(p_profile ->> 'business_model'), '') else business_model end,
    license_status = case when p_profile ? 'license_status' then coalesce(nullif(trim(p_profile ->> 'license_status'), ''), 'unknown') else license_status end,
    license_jurisdiction = case when p_profile ? 'license_jurisdiction' then nullif(trim(p_profile ->> 'license_jurisdiction'), '') else license_jurisdiction end,
    license_number = case when p_profile ? 'license_number' then nullif(trim(p_profile ->> 'license_number'), '') else license_number end,
    license_evidence_url = case when p_profile ? 'license_evidence_url' then nullif(trim(p_profile ->> 'license_evidence_url'), '') else license_evidence_url end,
    expected_monthly_volume = case when p_profile ? 'expected_monthly_volume' then nullif(trim(p_profile ->> 'expected_monthly_volume'), '')::numeric else expected_monthly_volume end,
    volume_currency = case when p_profile ? 'volume_currency' then upper(nullif(trim(p_profile ->> 'volume_currency'), '')) else volume_currency end,
    requested_currencies = case when p_profile ? 'requested_currencies' then array(
      select distinct upper(trim(value))
      from jsonb_array_elements_text(p_profile -> 'requested_currencies')
      where nullif(trim(value), '') is not null
    ) else requested_currencies end,
    requested_methods = case when p_profile ? 'requested_methods' then array(
      select distinct lower(trim(value))
      from jsonb_array_elements_text(p_profile -> 'requested_methods')
      where nullif(trim(value), '') is not null
    ) else requested_methods end,
    requested_flows = case when p_profile ? 'requested_flows' then array(
      select distinct lower(trim(value))
      from jsonb_array_elements_text(p_profile -> 'requested_flows')
      where nullif(trim(value), '') is not null
    ) else requested_flows end,
    traffic_types = case when p_profile ? 'traffic_types' then array(
      select distinct lower(trim(value))
      from jsonb_array_elements_text(p_profile -> 'traffic_types')
      where nullif(trim(value), '') is not null
    ) else traffic_types end,
    min_transaction_amount = case when p_profile ? 'min_transaction_amount' then nullif(trim(p_profile ->> 'min_transaction_amount'), '')::numeric else min_transaction_amount end,
    max_transaction_amount = case when p_profile ? 'max_transaction_amount' then nullif(trim(p_profile ->> 'max_transaction_amount'), '')::numeric else max_transaction_amount end,
    transaction_currency = case when p_profile ? 'transaction_currency' then upper(nullif(trim(p_profile ->> 'transaction_currency'), '')) else transaction_currency end,
    launch_timeline = case when p_profile ? 'launch_timeline' then nullif(trim(p_profile ->> 'launch_timeline'), '') else launch_timeline end,
    current_processing_setup = case when p_profile ? 'current_processing_setup' then nullif(trim(p_profile ->> 'current_processing_setup'), '') else current_processing_setup end,
    updated_at = now()
  where lead_id = p_lead_id
    and status not in ('won', 'lost', 'closed', 'spam');

  if not found then
    raise exception 'This payment request can no longer be edited';
  end if;

  v_dossier := private.refresh_offerpsp_merchant_dossier(p_lead_id);

  update public.offerpsp_leads
  set status = case
    when status in ('needs_clarification', 'provider_needs_info') and cardinality(v_dossier.missing_fields) = 0
      then 'dossier_ready'
    else status
  end
  where lead_id = p_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) values (
    p_lead_id,
    auth.uid(),
    case when public.is_offerpsp_staff() then 'staff' else 'client' end,
    'dossier_updated',
    case when public.is_offerpsp_staff() then 'Merchant dossier updated by staff' else 'Merchant profile updated' end,
    case when cardinality(v_dossier.missing_fields) = 0
      then 'The merchant profile now contains the required PSP review information.'
      else 'The merchant profile was saved; some PSP review information is still missing.'
    end,
    jsonb_build_object('missing_fields', v_dossier.missing_fields, 'dossier_status', v_dossier.status),
    true
  );

  return jsonb_build_object(
    'lead_id', p_lead_id,
    'dossier_status', v_dossier.status,
    'missing_fields', v_dossier.missing_fields,
    'complete', cardinality(v_dossier.missing_fields) = 0
  );
end;
$$;

create or replace function public.get_offerpsp_staff_request_workspace(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if not exists (select 1 from public.offerpsp_leads where lead_id = p_lead_id) then
    raise exception 'OfferPSP lead not found';
  end if;

  select jsonb_build_object(
    'dossier', coalesce((
      select to_jsonb(d)
      from private.offerpsp_merchant_dossiers d
      where d.lead_id = p_lead_id
    ), '{}'::jsonb),
    'shortlist_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'shortlist_id', s.id,
        'shortlist_status', s.status,
        'shortlist_version', s.version,
        'item_id', si.id,
        'option_code', si.public_code,
        'rank', si.rank,
        'client_response', si.client_response,
        'introduction_requested_at', si.introduction_requested_at,
        'provider_id', p.id,
        'provider_code', p.internal_code,
        'provider_name', p.brand_name,
        'route_id', r.id,
        'route_code', r.internal_code,
        'route_title', r.client_title,
        'client_snapshot', si.client_snapshot
      ) order by s.version desc, si.rank)
      from public.offerpsp_shortlists s
      join public.offerpsp_shortlist_items si on si.shortlist_id = s.id
      left join private.offerpsp_providers p on p.id = si.private_provider_id
      left join private.offerpsp_offer_routes r on r.id = si.offer_route_id
      where s.lead_id = p_lead_id
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'review_id', pr.id,
        'shortlist_item_id', pr.shortlist_item_id,
        'review_round', pr.review_round,
        'status', pr.status,
        'channel', pr.channel,
        'external_reference', pr.external_reference,
        'requested_information', pr.requested_information,
        'internal_notes', pr.internal_notes,
        'submitted_at', pr.submitted_at,
        'decided_at', pr.decided_at,
        'provider_code', p.internal_code,
        'provider_name', p.brand_name,
        'route_code', r.internal_code,
        'route_title', r.client_title
      ) order by pr.created_at desc)
      from private.offerpsp_provider_reviews pr
      join private.offerpsp_merchant_dossiers d on d.id = pr.dossier_id
      join private.offerpsp_providers p on p.id = pr.provider_id
      join private.offerpsp_offer_routes r on r.id = pr.route_id
      where d.lead_id = p_lead_id
    ), '[]'::jsonb),
    'introductions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'introduction_id', i.id,
        'review_id', i.provider_review_id,
        'status', i.status,
        'telegram_group_title', i.telegram_group_title,
        'telegram_group_url', i.telegram_group_url,
        'telegram_created_at', i.telegram_created_at,
        'zoom_url', i.zoom_url,
        'zoom_scheduled_at', i.zoom_scheduled_at,
        'result_notes', i.result_notes,
        'closed_at', i.closed_at,
        'provider_code', p.internal_code,
        'provider_name', p.brand_name,
        'route_code', r.internal_code,
        'route_title', r.client_title
      ) order by i.created_at desc)
      from private.offerpsp_introductions i
      join private.offerpsp_providers p on p.id = i.provider_id
      join private.offerpsp_offer_routes r on r.id = i.route_id
      where i.lead_id = p_lead_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_offerpsp_client_request_profile(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead public.offerpsp_leads;
  v_missing text[];
  v_requested_information text;
begin
  if auth.uid() is null or not public.can_access_offerpsp_client_lead(p_lead_id) then
    raise exception 'OfferPSP request not found';
  end if;

  select * into v_lead
  from public.offerpsp_leads
  where lead_id = p_lead_id;

  v_missing := array_remove(array[
    case when nullif(trim(v_lead.company), '') is null then 'legal_name' end,
    case when nullif(trim(v_lead.name), '') is null then 'contact_name' end,
    case when nullif(trim(v_lead.work_email), '') is null then 'contact_email' end,
    case when nullif(trim(v_lead.company_url), '') is null then 'product_url' end,
    case when cardinality(v_lead.target_geos) = 0 then 'target_geos' end,
    case when nullif(trim(v_lead.vertical), '') is null then 'vertical' end,
    case when v_lead.license_status is null or v_lead.license_status = 'unknown' then 'license_status' end,
    case when v_lead.license_status = 'licensed' and nullif(trim(v_lead.license_jurisdiction), '') is null then 'license_jurisdiction' end,
    case when v_lead.expected_monthly_volume is null then 'expected_monthly_volume' end,
    case when nullif(trim(v_lead.volume_currency), '') is null then 'volume_currency' end,
    case when cardinality(v_lead.requested_methods) = 0 then 'requested_methods' end,
    case when cardinality(v_lead.requested_flows) = 0 then 'requested_flows' end
  ]::text[], null);

  select pr.requested_information
  into v_requested_information
  from private.offerpsp_provider_reviews pr
  join private.offerpsp_merchant_dossiers d on d.id = pr.dossier_id
  where d.lead_id = p_lead_id
    and pr.status = 'needs_info'
    and nullif(trim(pr.requested_information), '') is not null
  order by pr.updated_at desc
  limit 1;

  return jsonb_build_object(
    'lead_id', v_lead.lead_id,
    'company', v_lead.company,
    'name', v_lead.name,
    'work_email', v_lead.work_email,
    'telegram', v_lead.telegram,
    'company_url', v_lead.company_url,
    'registration_geo', v_lead.registration_geo,
    'target_geos', v_lead.target_geos,
    'vertical', v_lead.vertical,
    'business_model', v_lead.business_model,
    'license_status', v_lead.license_status,
    'license_jurisdiction', v_lead.license_jurisdiction,
    'license_number', v_lead.license_number,
    'license_evidence_url', v_lead.license_evidence_url,
    'expected_monthly_volume', v_lead.expected_monthly_volume,
    'volume_currency', v_lead.volume_currency,
    'requested_currencies', v_lead.requested_currencies,
    'requested_methods', v_lead.requested_methods,
    'requested_flows', v_lead.requested_flows,
    'traffic_types', v_lead.traffic_types,
    'min_transaction_amount', v_lead.min_transaction_amount,
    'max_transaction_amount', v_lead.max_transaction_amount,
    'transaction_currency', v_lead.transaction_currency,
    'launch_timeline', v_lead.launch_timeline,
    'current_processing_setup', v_lead.current_processing_setup,
    'missing_fields', v_missing,
    'psp_requested_information', v_requested_information,
    'complete', cardinality(v_missing) = 0
  );
end;
$$;

create or replace function public.list_offerpsp_client_options(p_lead_id uuid default null)
returns table (
  shortlist_id uuid,
  lead_id uuid,
  version integer,
  title text,
  introduction text,
  status text,
  shared_at timestamptz,
  rank integer,
  option_code text,
  client_note text,
  client_response text,
  client_responded_at timestamptz,
  route_title text,
  geos jsonb,
  currencies jsonb,
  flow text,
  methods jsonb,
  traffic_types jsonb,
  integrations jsonb,
  client_fees jsonb,
  limits jsonb,
  settlement jsonb,
  valid_through text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    s.id,
    s.lead_id,
    s.version,
    s.title::text,
    s.introduction::text,
    s.status::text,
    s.shared_at,
    si.rank,
    si.public_code::text,
    coalesce(
      nullif(si.client_note, ''),
      'Selected for your operating profile. Detailed partner terms are disclosed during the managed introduction.'
    )::text,
    si.client_response::text,
    si.client_responded_at,
    (si.client_snapshot ->> 'title')::text,
    si.client_snapshot -> 'geos',
    si.client_snapshot -> 'currencies',
    (si.client_snapshot ->> 'flow')::text,
    si.client_snapshot -> 'methods',
    si.client_snapshot -> 'traffic_types',
    si.client_snapshot -> 'integrations',
    si.client_snapshot -> 'client_fees',
    si.client_snapshot -> 'limits',
    si.client_snapshot -> 'settlement',
    (si.client_snapshot ->> 'valid_through')::text
  from public.offerpsp_shortlists s
  join public.offerpsp_shortlist_items si on si.shortlist_id = s.id
  where s.status = 'shared'
    and (p_lead_id is null or s.lead_id = p_lead_id)
    and public.can_access_offerpsp_client_lead(s.lead_id)
  order by s.shared_at desc, si.rank;
$$;

revoke all on function public.update_offerpsp_client_dossier(uuid, jsonb) from public;
revoke execute on function public.update_offerpsp_client_dossier(uuid, jsonb) from anon;
grant execute on function public.update_offerpsp_client_dossier(uuid, jsonb) to authenticated;

revoke all on function public.get_offerpsp_staff_request_workspace(uuid) from public;
revoke execute on function public.get_offerpsp_staff_request_workspace(uuid) from anon;
grant execute on function public.get_offerpsp_staff_request_workspace(uuid) to authenticated;

revoke all on function public.get_offerpsp_client_request_profile(uuid) from public;
revoke execute on function public.get_offerpsp_client_request_profile(uuid) from anon;
grant execute on function public.get_offerpsp_client_request_profile(uuid) to authenticated;

revoke all on function public.list_offerpsp_client_options(uuid) from public;
revoke execute on function public.list_offerpsp_client_options(uuid) from anon;
grant execute on function public.list_offerpsp_client_options(uuid) to authenticated;

comment on function public.update_offerpsp_client_dossier(uuid, jsonb) is
  'Whitelisted client or agent update of merchant dossier fields for an accessible OfferPSP request.';

comment on function public.get_offerpsp_staff_request_workspace(uuid) is
  'Staff-only operational projection containing dossier, private shortlist mapping, PSP reviews and introductions.';

comment on function public.get_offerpsp_client_request_profile(uuid) is
  'Client-safe editable merchant profile and missing dossier fields for one accessible OfferPSP request.';

comment on function public.list_offerpsp_client_options(uuid) is
  'Client-safe shortlist projection that does not expose provider, route, margin or internal pricing identifiers.';
