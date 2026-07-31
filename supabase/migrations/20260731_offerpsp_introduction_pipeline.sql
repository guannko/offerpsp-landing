alter table public.offerpsp_shortlist_items
  add column if not exists selected_at timestamptz,
  add column if not exists introduction_requested_at timestamptz;

create table if not exists private.offerpsp_merchant_dossiers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.offerpsp_leads(lead_id) on delete cascade,
  legal_name text,
  brand_name text,
  contact_name text,
  contact_email text,
  contact_telegram text,
  product_url text,
  registration_geo text,
  target_geos text[] not null default '{}',
  vertical text,
  business_model text,
  license_status text,
  license_jurisdiction text,
  license_number text,
  license_evidence_url text,
  expected_monthly_volume numeric,
  volume_currency text,
  requested_currencies text[] not null default '{}',
  requested_methods text[] not null default '{}',
  requested_flows text[] not null default '{}',
  traffic_types text[] not null default '{}',
  average_transaction_value numeric,
  transaction_currency text,
  launch_timeline text,
  current_processing_setup text,
  risk_notes text,
  verification_state jsonb not null default '{}'::jsonb,
  missing_fields text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'needs_clarification', 'ready', 'submitted', 'archived')),
  prepared_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_monthly_volume is null or expected_monthly_volume >= 0),
  check (average_transaction_value is null or average_transaction_value >= 0)
);

create table if not exists private.offerpsp_provider_reviews (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references private.offerpsp_merchant_dossiers(id) on delete cascade,
  shortlist_item_id uuid not null references public.offerpsp_shortlist_items(id) on delete restrict,
  provider_id uuid not null references private.offerpsp_providers(id) on delete restrict,
  route_id uuid not null references private.offerpsp_offer_routes(id) on delete restrict,
  review_round integer not null default 1 check (review_round > 0),
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'needs_info', 'accepted', 'declined', 'withdrawn')),
  channel text check (channel is null or channel in ('telegram', 'email', 'portal', 'other')),
  external_reference text,
  requested_information text,
  internal_notes text,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shortlist_item_id, review_round)
);

create table if not exists private.offerpsp_introductions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.offerpsp_leads(lead_id) on delete cascade,
  provider_review_id uuid not null unique references private.offerpsp_provider_reviews(id) on delete restrict,
  provider_id uuid not null references private.offerpsp_providers(id) on delete restrict,
  route_id uuid not null references private.offerpsp_offer_routes(id) on delete restrict,
  responsible_manager uuid references auth.users(id) on delete set null,
  status text not null default 'approved'
    check (status in ('approved', 'telegram_created', 'zoom_scheduled', 'won', 'lost', 'cancelled')),
  telegram_group_title text,
  telegram_group_url text,
  telegram_created_at timestamptz,
  zoom_url text,
  zoom_scheduled_at timestamptz,
  result_notes text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offerpsp_dossiers_status_idx
  on private.offerpsp_merchant_dossiers (status, updated_at desc);
create index if not exists offerpsp_provider_reviews_status_idx
  on private.offerpsp_provider_reviews (status, updated_at desc);
create index if not exists offerpsp_provider_reviews_provider_idx
  on private.offerpsp_provider_reviews (provider_id, created_at desc);
create index if not exists offerpsp_introductions_status_idx
  on private.offerpsp_introductions (status, updated_at desc);

drop trigger if exists offerpsp_dossiers_set_updated_at
  on private.offerpsp_merchant_dossiers;
create trigger offerpsp_dossiers_set_updated_at
before update on private.offerpsp_merchant_dossiers
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_provider_reviews_set_updated_at
  on private.offerpsp_provider_reviews;
create trigger offerpsp_provider_reviews_set_updated_at
before update on private.offerpsp_provider_reviews
for each row execute function public.set_offerpsp_updated_at();

drop trigger if exists offerpsp_introductions_set_updated_at
  on private.offerpsp_introductions;
create trigger offerpsp_introductions_set_updated_at
before update on private.offerpsp_introductions
for each row execute function public.set_offerpsp_updated_at();

create or replace function private.refresh_offerpsp_merchant_dossier(p_lead_id uuid)
returns private.offerpsp_merchant_dossiers
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_lead public.offerpsp_leads;
  v_dossier private.offerpsp_merchant_dossiers;
  v_missing text[] := '{}';
begin
  select * into v_lead
  from public.offerpsp_leads
  where lead_id = p_lead_id;
  if not found then
    raise exception 'OfferPSP lead not found';
  end if;

  if nullif(trim(v_lead.company), '') is null then v_missing := array_append(v_missing, 'legal_name'); end if;
  if nullif(trim(v_lead.name), '') is null then v_missing := array_append(v_missing, 'contact_name'); end if;
  if nullif(trim(v_lead.work_email), '') is null then v_missing := array_append(v_missing, 'contact_email'); end if;
  if nullif(trim(v_lead.company_url), '') is null then v_missing := array_append(v_missing, 'product_url'); end if;
  if cardinality(v_lead.target_geos) = 0 then v_missing := array_append(v_missing, 'target_geos'); end if;
  if nullif(trim(v_lead.vertical), '') is null then v_missing := array_append(v_missing, 'vertical'); end if;
  if v_lead.license_status is null or v_lead.license_status = 'unknown' then v_missing := array_append(v_missing, 'license_status'); end if;
  if v_lead.license_status = 'licensed' and nullif(trim(v_lead.license_jurisdiction), '') is null then v_missing := array_append(v_missing, 'license_jurisdiction'); end if;
  if v_lead.expected_monthly_volume is null then v_missing := array_append(v_missing, 'expected_monthly_volume'); end if;
  if nullif(trim(v_lead.volume_currency), '') is null then v_missing := array_append(v_missing, 'volume_currency'); end if;
  if cardinality(v_lead.requested_methods) = 0 then v_missing := array_append(v_missing, 'requested_methods'); end if;
  if cardinality(v_lead.requested_flows) = 0 then v_missing := array_append(v_missing, 'requested_flows'); end if;

  insert into private.offerpsp_merchant_dossiers (
    lead_id,
    legal_name,
    brand_name,
    contact_name,
    contact_email,
    contact_telegram,
    product_url,
    registration_geo,
    target_geos,
    vertical,
    business_model,
    license_status,
    license_jurisdiction,
    license_number,
    license_evidence_url,
    expected_monthly_volume,
    volume_currency,
    requested_currencies,
    requested_methods,
    requested_flows,
    traffic_types,
    average_transaction_value,
    transaction_currency,
    launch_timeline,
    current_processing_setup,
    risk_notes,
    verification_state,
    missing_fields,
    status,
    prepared_by
  ) values (
    v_lead.lead_id,
    v_lead.company,
    v_lead.company,
    v_lead.name,
    v_lead.work_email,
    v_lead.telegram,
    v_lead.company_url,
    v_lead.registration_geo,
    v_lead.target_geos,
    v_lead.vertical,
    v_lead.business_model,
    v_lead.license_status,
    v_lead.license_jurisdiction,
    v_lead.license_number,
    v_lead.license_evidence_url,
    v_lead.expected_monthly_volume,
    v_lead.volume_currency,
    v_lead.requested_currencies,
    v_lead.requested_methods,
    v_lead.requested_flows,
    v_lead.traffic_types,
    case
      when v_lead.min_transaction_amount is not null and v_lead.max_transaction_amount is not null
        then (v_lead.min_transaction_amount + v_lead.max_transaction_amount) / 2
      else null
    end,
    v_lead.transaction_currency,
    v_lead.launch_timeline,
    v_lead.current_processing_setup,
    v_lead.qualification_notes,
    jsonb_build_object(
      'merchant_provided', jsonb_build_array(
        'legal_name', 'brand_name', 'contact_name', 'contact_email', 'contact_telegram',
        'product_url', 'registration_geo', 'target_geos', 'vertical', 'business_model',
        'license_status', 'license_jurisdiction', 'license_number', 'license_evidence_url',
        'expected_monthly_volume', 'volume_currency', 'requested_currencies',
        'requested_methods', 'requested_flows', 'traffic_types', 'launch_timeline',
        'current_processing_setup', 'risk_notes'
      ),
      'verified', '[]'::jsonb
    ),
    v_missing,
    case when cardinality(v_missing) = 0 then 'ready' else 'needs_clarification' end,
    auth.uid()
  )
  on conflict (lead_id)
  do update set
    legal_name = excluded.legal_name,
    brand_name = excluded.brand_name,
    contact_name = excluded.contact_name,
    contact_email = excluded.contact_email,
    contact_telegram = excluded.contact_telegram,
    product_url = excluded.product_url,
    registration_geo = excluded.registration_geo,
    target_geos = excluded.target_geos,
    vertical = excluded.vertical,
    business_model = excluded.business_model,
    license_status = excluded.license_status,
    license_jurisdiction = excluded.license_jurisdiction,
    license_number = excluded.license_number,
    license_evidence_url = excluded.license_evidence_url,
    expected_monthly_volume = excluded.expected_monthly_volume,
    volume_currency = excluded.volume_currency,
    requested_currencies = excluded.requested_currencies,
    requested_methods = excluded.requested_methods,
    requested_flows = excluded.requested_flows,
    traffic_types = excluded.traffic_types,
    average_transaction_value = excluded.average_transaction_value,
    transaction_currency = excluded.transaction_currency,
    launch_timeline = excluded.launch_timeline,
    current_processing_setup = excluded.current_processing_setup,
    risk_notes = excluded.risk_notes,
    missing_fields = excluded.missing_fields,
    status = case
      when private.offerpsp_merchant_dossiers.status = 'submitted'
        and cardinality(excluded.missing_fields) = 0
        then private.offerpsp_merchant_dossiers.status
      else excluded.status
    end
  returning * into v_dossier;

  return v_dossier;
end;
$$;

create or replace function public.respond_offerpsp_option(
  p_option_code text,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_item public.offerpsp_shortlist_items;
  v_lead_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_response not in ('interested', 'need_details', 'not_suitable') then
    raise exception 'Unsupported option response';
  end if;

  select si.*
  into v_item
  from public.offerpsp_shortlist_items si
  join public.offerpsp_shortlists s on s.id = si.shortlist_id
  join public.offerpsp_leads l on l.lead_id = s.lead_id
  where si.public_code = p_option_code
    and s.status = 'shared'
    and l.client_user_id = auth.uid();

  if not found then
    raise exception 'OfferPSP option not found';
  end if;

  select lead_id into v_lead_id
  from public.offerpsp_shortlists
  where id = v_item.shortlist_id;

  update public.offerpsp_shortlist_items
  set client_response = p_response,
      client_responded_at = now(),
      selected_at = case when p_response = 'interested' then now() else selected_at end
  where id = v_item.id;

  if p_response = 'interested' then
    update public.offerpsp_leads
    set status = 'option_selected'
    where lead_id = v_lead_id
      and status not in ('provider_reviewing', 'provider_needs_info', 'provider_accepted', 'telegram_created', 'zoom_scheduled', 'won', 'lost');
  end if;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, metadata, client_visible
  ) values (
    v_lead_id,
    auth.uid(),
    'client',
    'option_response',
    'Client responded to an anonymous option',
    jsonb_build_object('option_code', p_option_code, 'response', p_response),
    true
  );

  return jsonb_build_object('option_code', p_option_code, 'response', p_response);
end;
$$;

create or replace function public.request_offerpsp_introduction(p_option_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_item public.offerpsp_shortlist_items;
  v_lead_id uuid;
  v_dossier private.offerpsp_merchant_dossiers;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select si.*
  into v_item
  from public.offerpsp_shortlist_items si
  join public.offerpsp_shortlists s on s.id = si.shortlist_id
  join public.offerpsp_leads l on l.lead_id = s.lead_id
  where si.public_code = p_option_code
    and s.status = 'shared'
    and l.client_user_id = auth.uid();

  if not found then
    raise exception 'OfferPSP option not found';
  end if;

  select lead_id into v_lead_id
  from public.offerpsp_shortlists
  where id = v_item.shortlist_id;
  if v_item.offer_route_id is null or v_item.private_provider_id is null then
    raise exception 'This legacy option must be reissued from the private offer database before introduction';
  end if;

  update public.offerpsp_shortlist_items
  set client_response = 'interested',
      client_responded_at = coalesce(client_responded_at, now()),
      selected_at = coalesce(selected_at, now()),
      introduction_requested_at = now()
  where id = v_item.id;

  v_dossier := private.refresh_offerpsp_merchant_dossier(v_lead_id);

  update public.offerpsp_leads
  set status = case when v_dossier.status = 'ready' then 'dossier_ready' else 'needs_clarification' end
  where lead_id = v_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) values (
    v_lead_id,
    auth.uid(),
    'client',
    'introduction_requested',
    'Client requested an introduction',
    case when v_dossier.status = 'ready'
      then 'The merchant dossier is ready for staff verification.'
      else 'Additional merchant information is required before PSP review.'
    end,
    jsonb_build_object(
      'option_code', p_option_code,
      'dossier_status', v_dossier.status,
      'missing_fields', v_dossier.missing_fields
    ),
    true
  );

  return jsonb_build_object(
    'option_code', p_option_code,
    'status', v_dossier.status,
    'missing_fields', v_dossier.missing_fields
  );
end;
$$;

create or replace function public.submit_offerpsp_dossier_for_review(
  p_shortlist_item_id uuid,
  p_channel text default null,
  p_external_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_item public.offerpsp_shortlist_items;
  v_lead_id uuid;
  v_dossier private.offerpsp_merchant_dossiers;
  v_review private.offerpsp_provider_reviews;
  v_round integer;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;

  select si.*
  into v_item
  from public.offerpsp_shortlist_items si
  join public.offerpsp_shortlists s on s.id = si.shortlist_id
  where si.id = p_shortlist_item_id
    and si.introduction_requested_at is not null
  for update of si;
  if not found then
    raise exception 'Introduction request not found';
  end if;

  select lead_id into v_lead_id
  from public.offerpsp_shortlists
  where id = v_item.shortlist_id;
  if v_item.private_provider_id is null or v_item.offer_route_id is null then
    raise exception 'Private provider and route mapping are required';
  end if;

  v_dossier := private.refresh_offerpsp_merchant_dossier(v_lead_id);
  if cardinality(v_dossier.missing_fields) > 0 then
    raise exception 'Merchant dossier is incomplete: %', array_to_string(v_dossier.missing_fields, ', ');
  end if;

  select coalesce(max(review_round), 0) + 1 into v_round
  from private.offerpsp_provider_reviews
  where shortlist_item_id = v_item.id;

  insert into private.offerpsp_provider_reviews (
    dossier_id,
    shortlist_item_id,
    provider_id,
    route_id,
    review_round,
    status,
    channel,
    external_reference,
    submitted_by,
    submitted_at
  ) values (
    v_dossier.id,
    v_item.id,
    v_item.private_provider_id,
    v_item.offer_route_id,
    v_round,
    'reviewing',
    p_channel,
    nullif(trim(p_external_reference), ''),
    auth.uid(),
    now()
  ) returning * into v_review;

  update private.offerpsp_merchant_dossiers
  set status = 'submitted',
      verified_by = auth.uid(),
      verified_at = now()
  where id = v_dossier.id;

  update public.offerpsp_leads
  set status = 'provider_reviewing'
  where lead_id = v_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, metadata
  ) values (
    v_lead_id,
    auth.uid(),
    'staff',
    'provider_review_started',
    'Merchant dossier sent for private PSP review',
    jsonb_build_object('review_id', v_review.id, 'review_round', v_review.review_round)
  );

  return jsonb_build_object('review_id', v_review.id, 'status', v_review.status, 'review_round', v_review.review_round);
end;
$$;

create or replace function public.record_offerpsp_provider_review(
  p_review_id uuid,
  p_decision text,
  p_notes text default null,
  p_requested_information text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_review private.offerpsp_provider_reviews;
  v_lead_id uuid;
  v_lead_status text;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_decision not in ('accepted', 'declined', 'needs_info') then
    raise exception 'Unsupported provider decision';
  end if;

  update private.offerpsp_provider_reviews
  set status = p_decision,
      internal_notes = nullif(trim(p_notes), ''),
      requested_information = case when p_decision = 'needs_info'
        then nullif(trim(p_requested_information), '')
        else null
      end,
      decided_at = case when p_decision in ('accepted', 'declined') then now() else null end
  where id = p_review_id
    and status in ('pending', 'reviewing', 'needs_info')
  returning * into v_review;

  if not found then
    raise exception 'Active PSP review not found';
  end if;

  select d.lead_id into v_lead_id
  from private.offerpsp_merchant_dossiers d
  where d.id = v_review.dossier_id;

  v_lead_status := case p_decision
    when 'accepted' then 'provider_accepted'
    when 'declined' then 'provider_declined'
    else 'provider_needs_info'
  end;

  update public.offerpsp_leads
  set status = v_lead_status
  where lead_id = v_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, body, metadata, client_visible
  ) values (
    v_lead_id,
    auth.uid(),
    'staff',
    'provider_review_decision',
    case p_decision
      when 'accepted' then 'A payment route was approved for introduction'
      when 'declined' then 'A payment route was not approved'
      else 'More information is required before introduction'
    end,
    case when p_decision = 'needs_info' then p_requested_information else null end,
    jsonb_build_object('review_id', v_review.id, 'decision', p_decision),
    p_decision in ('accepted', 'needs_info')
  );

  return jsonb_build_object('review_id', v_review.id, 'decision', p_decision, 'lead_status', v_lead_status);
end;
$$;

create or replace function public.record_offerpsp_telegram_introduction(
  p_review_id uuid,
  p_group_title text,
  p_group_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_review private.offerpsp_provider_reviews;
  v_lead_id uuid;
  v_introduction private.offerpsp_introductions;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if nullif(trim(p_group_url), '') is null then
    raise exception 'Telegram group URL is required';
  end if;

  select * into v_review
  from private.offerpsp_provider_reviews
  where id = p_review_id and status = 'accepted';
  if not found then
    raise exception 'PSP acceptance is required before introduction';
  end if;

  select lead_id into v_lead_id
  from private.offerpsp_merchant_dossiers
  where id = v_review.dossier_id;

  insert into private.offerpsp_introductions (
    lead_id,
    provider_review_id,
    provider_id,
    route_id,
    responsible_manager,
    status,
    telegram_group_title,
    telegram_group_url,
    telegram_created_at
  ) values (
    v_lead_id,
    v_review.id,
    v_review.provider_id,
    v_review.route_id,
    auth.uid(),
    'telegram_created',
    nullif(trim(p_group_title), ''),
    nullif(trim(p_group_url), ''),
    now()
  )
  on conflict (provider_review_id)
  do update set
    status = 'telegram_created',
    telegram_group_title = excluded.telegram_group_title,
    telegram_group_url = excluded.telegram_group_url,
    telegram_created_at = excluded.telegram_created_at,
    responsible_manager = excluded.responsible_manager
  where private.offerpsp_introductions.status in ('approved', 'telegram_created')
  returning * into v_introduction;

  if not found then
    raise exception 'Introduction has already advanced beyond Telegram setup';
  end if;

  update public.offerpsp_leads
  set status = 'telegram_created'
  where lead_id = v_lead_id;

  insert into public.offerpsp_lead_activities (
    lead_id, actor_user_id, actor_type, activity_type, title, body, client_visible
  ) values (
    v_lead_id,
    auth.uid(),
    'staff',
    'telegram_introduction_created',
    'Telegram introduction created',
    p_group_url,
    true
  );

  return jsonb_build_object('introduction_id', v_introduction.id, 'status', v_introduction.status);
end;
$$;

create or replace function public.record_offerpsp_zoom(
  p_introduction_id uuid,
  p_zoom_url text,
  p_scheduled_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_introduction private.offerpsp_introductions;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_scheduled_at is null then
    raise exception 'Zoom date is required';
  end if;
  if nullif(trim(p_zoom_url), '') is null then
    raise exception 'Zoom URL is required';
  end if;

  update private.offerpsp_introductions
  set status = 'zoom_scheduled',
      zoom_url = nullif(trim(p_zoom_url), ''),
      zoom_scheduled_at = p_scheduled_at
  where id = p_introduction_id
    and status in ('telegram_created', 'zoom_scheduled')
  returning * into v_introduction;
  if not found then
    raise exception 'Telegram introduction must exist before Zoom scheduling';
  end if;

  update public.offerpsp_leads
  set status = 'zoom_scheduled'
  where lead_id = v_introduction.lead_id;

  return jsonb_build_object('introduction_id', v_introduction.id, 'status', v_introduction.status, 'scheduled_at', v_introduction.zoom_scheduled_at);
end;
$$;

create or replace function public.close_offerpsp_introduction(
  p_introduction_id uuid,
  p_result text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_introduction private.offerpsp_introductions;
begin
  if not public.is_offerpsp_staff() then
    raise exception 'OfferPSP staff access required';
  end if;
  if p_result not in ('won', 'lost') then
    raise exception 'Result must be won or lost';
  end if;

  update private.offerpsp_introductions
  set status = p_result,
      result_notes = nullif(trim(p_notes), ''),
      closed_at = now()
  where id = p_introduction_id
    and status in ('telegram_created', 'zoom_scheduled')
  returning * into v_introduction;
  if not found then
    raise exception 'Active introduction not found';
  end if;

  update public.offerpsp_leads
  set status = p_result
  where lead_id = v_introduction.lead_id;

  return jsonb_build_object('introduction_id', v_introduction.id, 'status', v_introduction.status);
end;
$$;

revoke all on function private.refresh_offerpsp_merchant_dossier(uuid) from public;

revoke all on function public.respond_offerpsp_option(text, text) from public;
revoke execute on function public.respond_offerpsp_option(text, text) from anon;
grant execute on function public.respond_offerpsp_option(text, text) to authenticated;

revoke all on function public.request_offerpsp_introduction(text) from public;
revoke execute on function public.request_offerpsp_introduction(text) from anon;
grant execute on function public.request_offerpsp_introduction(text) to authenticated;

revoke all on function public.submit_offerpsp_dossier_for_review(uuid, text, text) from public;
revoke execute on function public.submit_offerpsp_dossier_for_review(uuid, text, text) from anon;
grant execute on function public.submit_offerpsp_dossier_for_review(uuid, text, text) to authenticated;

revoke all on function public.record_offerpsp_provider_review(uuid, text, text, text) from public;
revoke execute on function public.record_offerpsp_provider_review(uuid, text, text, text) from anon;
grant execute on function public.record_offerpsp_provider_review(uuid, text, text, text) to authenticated;

revoke all on function public.record_offerpsp_telegram_introduction(uuid, text, text) from public;
revoke execute on function public.record_offerpsp_telegram_introduction(uuid, text, text) from anon;
grant execute on function public.record_offerpsp_telegram_introduction(uuid, text, text) to authenticated;

revoke all on function public.record_offerpsp_zoom(uuid, text, timestamptz) from public;
revoke execute on function public.record_offerpsp_zoom(uuid, text, timestamptz) from anon;
grant execute on function public.record_offerpsp_zoom(uuid, text, timestamptz) to authenticated;

revoke all on function public.close_offerpsp_introduction(uuid, text, text) from public;
revoke execute on function public.close_offerpsp_introduction(uuid, text, text) from anon;
grant execute on function public.close_offerpsp_introduction(uuid, text, text) to authenticated;

grant all on private.offerpsp_merchant_dossiers to service_role;
grant all on private.offerpsp_provider_reviews to service_role;
grant all on private.offerpsp_introductions to service_role;

comment on table private.offerpsp_provider_reviews is
  'PSP-side accept, decline and request-more-information decisions. Provider identity remains internal until acceptance and managed introduction.';
comment on function public.request_offerpsp_introduction(text) is
  'Client-safe request. Returns dossier completeness only and never reveals provider identity.';
